import { Stack } from "aws-cdk-lib";
import { Table } from "aws-cdk-lib/aws-dynamodb";
import { EventBus } from "aws-cdk-lib/aws-events";
import { Effect, IRole, ManagedPolicy, Policy, PolicyDocument, PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { CfnDataLakeSettings } from "aws-cdk-lib/aws-lakeformation";
import { Code, Function, LayerVersion, Runtime } from "aws-cdk-lib/aws-lambda";
import { Choice, Condition, IntegrationPattern, JsonPath, StateMachine, TaskInput } from "aws-cdk-lib/aws-stepfunctions";
import { CallAwsService, LambdaInvoke } from "aws-cdk-lib/aws-stepfunctions-tasks";
import { Construct } from "constructs";

export interface TbacSharingWorkflowProps {
    dataDomainTagName?: string
    confidentialityTagName?: string
    cognitoAuthRole: IRole
    approvalsTable: Table
    centralEventBusArn: string
    approvalsLayer: LayerVersion
}

export class TbacSharingWorkflow extends Construct {

    readonly lfTagGrantPermissionsRole: Role
    readonly tbacSharingWorkflow: StateMachine
    readonly adjustGlueResourcePolicyFunction: Function

    constructor(scope: Construct, id: string, props: TbacSharingWorkflowProps) {
        super(scope, id);

        const adjustGlueResourcePolicyRole = new Role(this, "AdjustGlueResourcePolicyRole", {
            assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
            managedPolicies: [ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole")],
            inlinePolicies: {
                "GlueStatements": new PolicyDocument({
                    statements: [
                        new PolicyStatement({
                            effect: Effect.ALLOW,
                            actions: ["glue:GetResourcePolicy", "glue:PutResourcePolicy"],
                            resources: ["*"]
                        })
                    ]
                })
            }
        });

        const adjustGlueResourcePolicyFunction = new Function(this, "AdjustGlueResourcePolicyFunction", {
            runtime: Runtime.NODEJS_16_X,
            handler: "index.handler",
            role: adjustGlueResourcePolicyRole,
            code: Code.fromAsset(__dirname+"/resources/lambda/LFTagAdjustGlueResourcePolicy")
        });

        this.adjustGlueResourcePolicyFunction = adjustGlueResourcePolicyFunction

        const checkApprovalRequirementRole = new Role(this, "CheckApprovalRequirementRole", {
            assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
            managedPolicies: [ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole")]
        });

        const checkApprovalRequirementFunction = new Function(this, "CheckApprovalRequirementFunction", {
            runtime: Runtime.NODEJS_16_X,
            handler: "index.handler",
            role: checkApprovalRequirementRole,
            code: Code.fromAsset(__dirname+"/resources/lambda/LFTagCheckApprovalRequirement")
        });        

        const grantPermissionRole = new Role(this, "LFTagGrantPermissionRole", {
            assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
            managedPolicies: [ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole")],
            inlinePolicies: {
                "LakeFormationPermissions": new PolicyDocument({
                    statements: [
                        new PolicyStatement({
                            effect: Effect.ALLOW,
                            actions: ["lakeformation:GrantPermissions"],
                            resources: ["*"]
                        })
                    ]
                })
            }
        });

        const grantPermissionFunction = new Function(this, "LFTagGrantPermissions", {
            runtime: Runtime.NODEJS_16_X,
            handler: "index.handler",
            role: grantPermissionRole,
            code: Code.fromAsset(__dirname+"/resources/lambda/LFTagGrantPermissions")
        });

        const invokeAdjustGlueResourcePolicy = new LambdaInvoke(this, "InvokeAdjustGlueResourcePolicy", {
            lambdaFunction: adjustGlueResourcePolicyFunction,
            resultPath: JsonPath.DISCARD,
            payload: TaskInput.fromObject({
                "accountId.$": "$.targetAccountId"
            })
        });

        const invokeCheckApprovalRequirement = new LambdaInvoke(this, "InvokeCheckApprovalRequirement", {
            lambdaFunction: checkApprovalRequirementFunction,
            resultPath: "$.approvalCheck"
        })

        const invokeGrantPermissions = new LambdaInvoke(this, "InvokeGrantPermissions", {
            lambdaFunction: grantPermissionFunction,
            resultPath: JsonPath.DISCARD
        
        })

        const sendApprovalRole = new Role(this, "SendApprovalRole", {
            assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
            managedPolicies: [ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole")],
            inlinePolicies: {
                "RecordApprovalRequest": new PolicyDocument({
                    statements: [
                        new PolicyStatement({
                            effect: Effect.ALLOW,
                            actions: [
                                "dynamodb:TransactWriteItems",
                                "dynamodb:PutItem",
                                "dynamodb:UpdateItem"
                            ],
                            resources: [props.approvalsTable.tableArn]
                        })
                    ]
                })
            }
        });

        const sendApprovalFunction = new Function(this, "SendApprovalFunction", {
            runtime: Runtime.NODEJS_16_X,
            handler: 'index.handler',
            code: Code.fromAsset(__dirname+"/resources/lambda/LFTagSendApproval"),
            role: sendApprovalRole,
            environment: {
                APPROVALS_TABLE_NAME: props.approvalsTable.tableName
            },
            layers: [props.approvalsLayer]
        });

        const invokeSendApprovalFunction = new LambdaInvoke(this, "InvokeSendApprovalFunction", {
            lambdaFunction: sendApprovalFunction,
            integrationPattern: IntegrationPattern.WAIT_FOR_TASK_TOKEN,
            payload: TaskInput.fromObject({
                "Input.$": "$",
                "TaskToken": JsonPath.taskToken
            }),
            resultPath: JsonPath.DISCARD
        })

        const centralEventBus = EventBus.fromEventBusArn(this, "CentralEventBus", props.centralEventBusArn);
        const sfnEmitToCentralEventBus = new CallAwsService(this, "EmitToCentralEventBus", {
            service: "eventbridge",
            action: "putEvents",
            iamResources: ["*"],
            iamAction: "events:PutEvents",
            parameters: {
                "Entries": [
                    {
                      "Detail": {
                        "central_account_id": Stack.of(this).account,
                        "central_database_name.$": "$.databaseName",
                        "database_name": "tbac-data-domain",
                        "lf_access_mode": "tbac",
                        "producer_acc_id.$": "$.producerAccountId"
                      },
                      "DetailType.$": "States.Format('{}_createResourceLinks', $.targetAccountId)",
                      "EventBusName": centralEventBus.eventBusName,
                      "Source": "com.central.stepfunction"
                    }
                ]
            },
            resultPath: JsonPath.DISCARD
        });


        invokeGrantPermissions.next(sfnEmitToCentralEventBus)

        const approvalChoice = new Choice(this, "approvalRequirementCheck");
        approvalChoice.when(Condition.booleanEquals("$.approvalCheck.Payload.requires_approval", true), invokeSendApprovalFunction.next(invokeGrantPermissions))
            .otherwise(invokeGrantPermissions)

        invokeAdjustGlueResourcePolicy.next(invokeCheckApprovalRequirement).next(approvalChoice);

        this.tbacSharingWorkflow = new StateMachine(this, "TbacSharingWorkflow", {
            definition: invokeAdjustGlueResourcePolicy
        });

        this.lfTagGrantPermissionsRole = grantPermissionRole

        props.cognitoAuthRole.attachInlinePolicy(new Policy(this, "TbacWorkflowPermission", {
            statements: [
                new PolicyStatement({
                    effect: Effect.ALLOW,
                    actions: ["states:StartExecution"],
                    resources: [this.tbacSharingWorkflow.stateMachineArn]
                })
            ]
        }))

        new CfnDataLakeSettings(this, "LakeFormationSettings", {
            admins: [
                {
                    dataLakePrincipalIdentifier: grantPermissionRole.roleArn
                }
            ]
        });
    }
}