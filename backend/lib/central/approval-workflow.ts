import { HttpApi } from "@aws-cdk/aws-apigatewayv2-alpha";
import { HttpLambdaIntegration } from "@aws-cdk/aws-apigatewayv2-integrations-alpha";
import { IdentityPool, UserPoolAuthenticationProvider } from "@aws-cdk/aws-cognito-identitypool-alpha";
import { RemovalPolicy, Stack } from "aws-cdk-lib";
import { UserPool } from "aws-cdk-lib/aws-cognito";
import { EventBus, EventField, Rule, RuleTargetInput } from "aws-cdk-lib/aws-events";
import { SfnStateMachine } from "aws-cdk-lib/aws-events-targets";
import { Effect, FederatedPrincipal, ManagedPolicy, Policy, PolicyDocument, PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { Code, Function, Runtime } from "aws-cdk-lib/aws-lambda";
import { Choice, Condition, IntegrationPattern, JsonPath, Pass, StateMachine, StateMachineType, TaskInput } from "aws-cdk-lib/aws-stepfunctions";
import { CallAwsService, HttpMethod, LambdaInvoke } from "aws-cdk-lib/aws-stepfunctions-tasks";
import { Construct } from "constructs";
const util = require("util");

export interface ApprovalWorkflowProps {
    dpmStateMachineArn?:string,
    dpmStateMachineRoleArn?: string,
    centralEventBusArn: string
}

export class ApprovalWorkflow extends Construct {

    readonly stateMachineWorkflowRole: Role;
    readonly workflowLambdaSMApproverRole: Role;
    readonly workflowLambdaSendApprovalEmailRole: Role;
    readonly workflowLambdaShareCatalogItemRole: Role;
    readonly workflowLambdaTableDetailsRole: Role;
    
    readonly stateMachine: StateMachine;

    constructor(scope: Construct, id: string, props:ApprovalWorkflowProps) {
        super(scope, id);

        const workflowLambdaSMApproverRolePolicy = new PolicyDocument({
            statements: [
                new PolicyStatement({
                    effect: Effect.ALLOW,
                    actions: [
                        "states:SendTaskSuccess",
                        "states:SendTaskFailure"
                    ],
                    resources: ["*"]
                })
            ]
        });

        //event bus for workflow
        const centralApprovalEventBus = new EventBus(this, "CentralApprovalEventBus", {
            eventBusName: util.format("%s_centralApprovalBus", Stack.of(this).account)
        });

        centralApprovalEventBus.applyRemovalPolicy(RemovalPolicy.DESTROY);

        const eventBridgeCrossAccountRole = new Role(this, "EventBridgeCrossAccountRole", {
            assumedBy: new ServicePrincipal("events.amazonaws.com"),
            inlinePolicies: {
                "AllowPutEvents": new PolicyDocument({
                    statements: [
                        new PolicyStatement({
                            effect: Effect.ALLOW,
                            actions: ["events:PutEvents"],
                            resources: ["*"]
                        })
                    ]
                })
            }
        })

        this.workflowLambdaSMApproverRole = new Role(this, "WorkflowLambdaSMApproverRole", {
            assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
            managedPolicies: [ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole")],
            inlinePolicies: {inline0: workflowLambdaSMApproverRolePolicy}
        });


        this.workflowLambdaSendApprovalEmailRole = new Role(this, "WorkflowLambdaSendApprovalEmailRole", {
            assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
            managedPolicies: [ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole")],
            inlinePolicies: {
                "AllowCentralApprovalBus": new PolicyDocument({
                    statements: [
                        new PolicyStatement({
                            effect: Effect.ALLOW,
                            actions: ["events:PutEvents"],
                            resources: [centralApprovalEventBus.eventBusArn]
                        })
                    ]
                })
            }
        });

        const workflowLambdaShareCatalogItemRolePolicy = new PolicyDocument({
            statements: [
                new PolicyStatement({
                    effect: Effect.ALLOW,
                    actions: [
                        "lakeformation:GrantPermissions",
                        "glue:GetTable",
                        "glue:GetDatabase"
                    ],
                    resources: ["*"]
                })
            ]
        });

        this.workflowLambdaShareCatalogItemRole = new Role(this, "WorkflowLambdaShareCatalogItemRole", {
            assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
            managedPolicies: [ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"), ManagedPolicy.fromAwsManagedPolicyName("AWSLakeFormationCrossAccountManager")],
            inlinePolicies: {inline0: workflowLambdaShareCatalogItemRolePolicy}
        });

        const workflowLambdaTableDetailsRolePolicy = new PolicyDocument({
            statements: [
                new PolicyStatement({
                    effect: Effect.ALLOW,
                    actions: [
                        "glue:GetTable",
                        "glue:GetDatabase"
                    ],
                    resources: ["*"]
                })
            ]
        });

        this.workflowLambdaTableDetailsRole = new Role(this, "WorkflowLambdaTableDetailsRole", {
            assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
            managedPolicies: [ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole")],
            inlinePolicies: {inline0: workflowLambdaTableDetailsRolePolicy}
        });

        this.stateMachineWorkflowRole = new Role(this, "DataLakeWorkflowRole", {
            assumedBy: new ServicePrincipal("states.amazonaws.com"),
            inlinePolicies: {
                "AllowEmitEvent": new PolicyDocument({
                    statements: [
                        new PolicyStatement({
                            effect: Effect.ALLOW,
                            actions: ["events:PutEvents"],
                            resources: ["*"]
                        })
                    ]
                })
            }
        });

        const workflowActivityApprover = new Function(this, "WorkflowActivityApprover", {
            runtime: Runtime.NODEJS_14_X,
            handler: 'index.handler',
            code: Code.fromAsset(__dirname+"/resources/lambda/WorkflowActivityApprover"),
            role: this.workflowLambdaSMApproverRole
        });

        const httpApi = new HttpApi(this, "DataLakeWorkflowAPIGW");
        httpApi.addRoutes({
            path: '/workflow/update-state',
            methods: [HttpMethod.GET],
            integration: new HttpLambdaIntegration("ApprovalStateIntegration", workflowActivityApprover)
        });

        const deriveBaseDatabaseName = new Function(this, "DeriveBaseDatabaseName", {
            runtime: Runtime.NODEJS_14_X,
            handler: 'index.handler',
            code: Code.fromAsset(__dirname+"/resources/lambda/DeriveBaseDatabaseName")
        });

        const workflowSendApprovalNotification = new Function(this, "WorkflowSendApprovalNotification", {
            runtime: Runtime.NODEJS_14_X,
            handler: 'index.handler',
            code: Code.fromAsset(__dirname+"/resources/lambda/WorkflowSendApprovalNotification"),
            role: this.workflowLambdaSendApprovalEmailRole,
            environment: {
                "API_GATEWAY_BASE_URL": httpApi.apiEndpoint+"/workflow",
                "CENTRAL_APPROVAL_BUS_NAME": centralApprovalEventBus.eventBusName
            }
        });

        const workflowGetTableDetails = new Function(this, "WorkflowGetTableDetails", {
            runtime: Runtime.NODEJS_14_X,
            handler: 'index.handler',
            code: Code.fromAsset(__dirname+"/resources/lambda/WorkflowGetTableDetails"),
            role: this.workflowLambdaTableDetailsRole
        });

        const workflowShareCatalogItem = new Function(this, "WorkflowShareCatalogItem", {
            runtime: Runtime.NODEJS_14_X,
            handler: 'index.handler',
            code: Code.fromAsset(__dirname+"/resources/lambda/WorkflowShareCatalogItem"),
            role: this.workflowLambdaShareCatalogItemRole
        });

        const sfnDeriveBaseDbName = new LambdaInvoke(this, "DeriveBaseDbName", {
            lambdaFunction: deriveBaseDatabaseName,
            resultPath: "$.derivedDbName"
        });

        const sfnGetCatalogTableDetails = new LambdaInvoke(this, "GetCatalogTableDetails", {
            lambdaFunction: workflowGetTableDetails,
            payload: TaskInput.fromObject({
                "database.$": "$.source.database",
                "table.$": "$.source.table"
            }),
            resultPath: "$.table_details"
        });

        const sfnNoPIIShareCatalogItem = new LambdaInvoke(this, "NoPIIShareCatalogItem", {
            lambdaFunction: workflowShareCatalogItem,
            payload: TaskInput.fromObject({
                "source.$": "$.source",
                "target.$": "$.target",
            }),
            resultPath: JsonPath.DISCARD
        });

        const sfnSendAndWaitPIIColumnApproval = new LambdaInvoke(this, "SendAndWaitPIIColumnApproval", {
            lambdaFunction: workflowSendApprovalNotification,
            integrationPattern: IntegrationPattern.WAIT_FOR_TASK_TOKEN,
            payload: TaskInput.fromObject({
                "Input.$": "$",
                "TaskToken": JsonPath.taskToken
            }),
            resultPath: "$.approval_details"
        });

        const sfnApprovedPIIShareCatalogItem = new LambdaInvoke(this, "ApprovedPIIShareCatalogItem", {
            lambdaFunction: workflowShareCatalogItem,
            payload: TaskInput.fromObject({
                "source.$": "$.source",
                "target.$": "$.target",
            }),
            resultPath: JsonPath.DISCARD
        });

        const centralEventBus = EventBus.fromEventBusArn(this, "CentralEventBus", props.centralEventBusArn);

        const sfnEmitToCentralEventBus = new CallAwsService(this, "EmitToCentralEventBus", {
            service: "eventbridge",
            action: "putEvents",
            iamResources: ["*"],
            parameters: {
                "Entries": [
                    {
                      "Detail": {
                        "central_database_name.$": "$.source.database",
                        "database_name.$": "$.derivedDbName.Payload.raw_db",
                        "table_names.$": "States.Array($.source.table)"
                      },
                      "DetailType.$": "States.Format('{}_createResourceLinks', $.target.account_id)",
                      "EventBusName": centralEventBus.eventBusName,
                      "Source": "com.central.stepfunction"
                    }
                ]
            },
            resultPath: JsonPath.DISCARD
        });

        const sfnDoesItHavePIIColumns = new Choice(this, "DoesItHavePIIColumns");

        const sfnDefinition = sfnDeriveBaseDbName.next(sfnGetCatalogTableDetails).next(
            sfnDoesItHavePIIColumns
                .when(Condition.booleanEquals("$.table_details.Payload.has_pii", false), sfnNoPIIShareCatalogItem.next(sfnEmitToCentralEventBus))
                .otherwise(sfnSendAndWaitPIIColumnApproval.next(sfnApprovedPIIShareCatalogItem).next(sfnEmitToCentralEventBus))
        );

        this.stateMachine = new StateMachine(this, "DataLakeApprovalWorkflow", {
            definition: sfnDefinition,
            stateMachineType: StateMachineType.STANDARD,
            role: this.stateMachineWorkflowRole
        });

        if (props && props.dpmStateMachineArn && props.dpmStateMachineRoleArn) {
            const grantWorkflowLambdaTableDetailsPermission = new CallAwsService(this, "DPMGrantWorkflowLambdaTableDetailsPermission", {
                service: "lakeformation",
                action: "grantPermissions",
                iamResources: ["*"],
                parameters: {
                    "Permissions": [
                        "DESCRIBE"
                    ],
                    "Principal": {
                        "DataLakePrincipalIdentifier": this.workflowLambdaTableDetailsRole.roleArn
                    },
                    "Resource": {
                        "Table": {
                          "DatabaseName.$": "States.Format('{}_{}', $.producer_acc_id, $.database_name)",
                          "TableWildcard": {}
                        }
                    }
                },
                resultPath: JsonPath.DISCARD,
                inputPath: "$.payload"
            });
    
            const grantWorkflowLambdaShareCatalogPermission = new CallAwsService(this, "DPMGrantWorkflowLambdaShareCatalogPermission", {
                service: "lakeformation",
                action: "grantPermissions",
                iamResources: ["*"],
                parameters: {
                    "Permissions": [
                        "SELECT",
                        "DESCRIBE"
                    ],
                    "PermissionsWithGrantOption": [
                        "SELECT",
                        "DESCRIBE"
                    ],
                    "Principal": {
                        "DataLakePrincipalIdentifier": this.workflowLambdaShareCatalogItemRole.roleArn
                    },
                    "Resource": {
                        "Table": {
                          "DatabaseName.$": "States.Format('{}_{}', $.producer_acc_id, $.database_name)",
                          "TableWildcard": {}
                        }
                    }
                },
                resultPath: JsonPath.DISCARD,
                inputPath: "$.payload"
            });

            const emitApprovalWorkflowProducerEventRule = new CallAwsService(this, "EmitApprovalWorkflowProducerEventRule", {
                service: "eventbridge",
                action: "putRule",
                iamResources: ["*"],
                inputPath: "$.payload",
                resultPath: JsonPath.DISCARD,
                parameters: {
                    "Name.$": "States.Format('{}_sharingApproval', $.producer_acc_id)",
                    "EventBusName": centralApprovalEventBus.eventBusName,
                    "EventPattern": {
                        "source": ["com.central.sharing-approval"],
                        "detail-type": [{
                            "prefix.$": "States.Format('{}_', $.producer_acc_id)"
                        }]
                    }
                }
            })

            const lfAdminRole = Role.fromRoleArn(this, "DPMLFAdminRole", props.dpmStateMachineRoleArn);

            lfAdminRole.attachInlinePolicy(new Policy(this, "eventBridgePassRolePolicy", {
                document: new PolicyDocument({
                    statements: [
                        new PolicyStatement({
                            effect: Effect.ALLOW,
                            actions: ["iam:PassRole"],
                            resources: [eventBridgeCrossAccountRole.roleArn]
                        })
                    ]
                })
            }))

            const approvalWorkflowTarget = new CallAwsService(this, "ApprovalWorkflowTarget", {
                service: "eventbridge",
                action: "putTargets",
                iamResources: ["*"],
                inputPath: "$.payload",
                resultPath: JsonPath.DISCARD,
                parameters: {
                    "EventBusName": centralApprovalEventBus.eventBusName,
                    "Rule.$": "States.Format('{}_sharingApproval', $.producer_acc_id)",
                    "Targets": [
                        {
                            "Id.$": "States.Format('{}_approvalWorkflowTarget', $.producer_acc_id)",
                            "Arn.$": util.format("States.Format('arn:aws:events:%s:{}:event-bus/{}_sharingApprovalBus', $.producer_acc_id, $.producer_acc_id)", Stack.of(this).region),
                            "RoleArn": eventBridgeCrossAccountRole.roleArn
                        }
                    ]
                }
            })

            const initialState = new Pass(this, "InitialState", {
                inputPath: "$.detail.input",
                parameters: {
                    "payload.$": "States.StringToJson($)"
                }
            })

            approvalWorkflowTarget.endStates;

            emitApprovalWorkflowProducerEventRule.next(approvalWorkflowTarget);

            grantWorkflowLambdaShareCatalogPermission.next(emitApprovalWorkflowProducerEventRule);

            grantWorkflowLambdaTableDetailsPermission.next(grantWorkflowLambdaShareCatalogPermission);

            initialState.next(grantWorkflowLambdaTableDetailsPermission);

            const workflowNewProductAuthFlow = new StateMachine(this, "WorkflowNewProductAuthFlow", {
                definition: initialState,
                role: Role.fromRoleArn(this, "DPMStateMachineRole", props.dpmStateMachineRoleArn),
                stateMachineType: StateMachineType.STANDARD
            });

            const dpmAddProdEventBridgeRule = new Rule(this, 'DPMAddProdWorkflowRule', {
                eventPattern: {
                    source: ["aws.states"],
                    detailType: ["Step Functions Execution Status Change"],
                    detail: {
                        "status": ["SUCCEEDED"],
                        "stateMachineArn": [props.dpmStateMachineArn]
                    }
                }
            });

            dpmAddProdEventBridgeRule.applyRemovalPolicy(RemovalPolicy.DESTROY);

            dpmAddProdEventBridgeRule.addTarget(new SfnStateMachine(workflowNewProductAuthFlow))
        }
    }
}