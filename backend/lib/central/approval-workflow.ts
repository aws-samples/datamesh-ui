import { CorsHttpMethod, HttpApi, HttpNoneAuthorizer } from "@aws-cdk/aws-apigatewayv2-alpha";
import { HttpLambdaIntegration } from "@aws-cdk/aws-apigatewayv2-integrations-alpha";
import { IdentityPool, UserPoolAuthenticationProvider } from "@aws-cdk/aws-cognito-identitypool-alpha";
import { Duration, RemovalPolicy, Stack } from "aws-cdk-lib";
import { UserPool } from "aws-cdk-lib/aws-cognito";
import { AttributeType, BillingMode, Table, TableEncryption } from "aws-cdk-lib/aws-dynamodb";
import { EventBus, EventField, Rule, RuleTargetInput } from "aws-cdk-lib/aws-events";
import { SfnStateMachine } from "aws-cdk-lib/aws-events-targets";
import { Effect, FederatedPrincipal, ManagedPolicy, Policy, PolicyDocument, PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { Code, Function, LayerVersion, Runtime } from "aws-cdk-lib/aws-lambda";
import { Choice, Condition, IntegrationPattern, JsonPath, Pass, StateMachine, StateMachineType, TaskInput } from "aws-cdk-lib/aws-stepfunctions";
import { CallAwsService, HttpMethod, LambdaInvoke } from "aws-cdk-lib/aws-stepfunctions-tasks";
import { NagSuppressions } from "cdk-nag";
import { Construct } from "constructs";
const util = require("util");

export interface ApprovalWorkflowProps {
    dpmStateMachineArn?:string,
    dpmStateMachineRoleArn?: string,
    centralEventBusArn: string,
    httpApi: HttpApi
}

export class ApprovalWorkflow extends Construct {

    readonly stateMachineWorkflowRole: Role;
    readonly workflowLambdaSMApproverRole: Role;
    readonly workflowLambdaSendApprovalEmailRole: Role;
    readonly workflowLambdaShareCatalogItemRole: Role;
    readonly workflowLambdaTableDetailsRole: Role;
    
    readonly stateMachine: StateMachine;
    readonly centralApprovalEventBus: EventBus;
    readonly approvalBaseUrl: string;

    readonly productShareMappingTable: Table
    readonly approvalsTable: Table
    readonly approvalsLayer: LayerVersion

    constructor(scope: Construct, id: string, props:ApprovalWorkflowProps) {
        super(scope, id);

        this.approvalsTable = new Table(this, "DataProductShareApprovals", {
            partitionKey: {
                name: "accountId",
                type: AttributeType.STRING
            },
            sortKey: {
                name: "requestIdentifier",
                type: AttributeType.STRING
            },
            billingMode: BillingMode.PAY_PER_REQUEST,
            encryption: TableEncryption.AWS_MANAGED,
            removalPolicy: RemovalPolicy.DESTROY
        });

        this.productShareMappingTable = new Table(this, "ProductShareMappingTable", {
            partitionKey: {
                name: "domainId",
                type: AttributeType.STRING
            },
            sortKey: {
                name: "resourceMapping",
                type: AttributeType.STRING
            },
            billingMode: BillingMode.PAY_PER_REQUEST
        })

        this.approvalsLayer = new LayerVersion(this, "ApprovalsLayer", {
            code: Code.fromAsset(__dirname+"/resources/lambda/layers/approvals"),
            compatibleRuntimes: [Runtime.NODEJS_LATEST],
            removalPolicy: RemovalPolicy.DESTROY
        })

        this.workflowLambdaSendApprovalEmailRole = new Role(this, "WorkflowLambdaSendApprovalEmailRole", {
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
                            resources: [this.approvalsTable.tableArn, this.productShareMappingTable.tableArn]
                        })
                    ]
                })
            }
        });

        NagSuppressions.addResourceSuppressions(this.workflowLambdaSendApprovalEmailRole, [
            {
                id: "AwsSolutions-IAM4",
                reason: "Basic logging functionality"
            }
        ])

        this.workflowLambdaShareCatalogItemRole = new Role(this, "WorkflowLambdaShareCatalogItemRole", {
            assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
            managedPolicies: [ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"), ManagedPolicy.fromAwsManagedPolicyName("AWSLakeFormationCrossAccountManager")],
            inlinePolicies: {inline0: new PolicyDocument({
                statements: [
                    new PolicyStatement({
                        effect: Effect.ALLOW,
                        actions: [
                            "lakeformation:GrantPermissions",
                            "glue:GetTable",
                            "glue:GetDatabase"
                        ],
                        resources: ["*"]
                    }),
                    new PolicyStatement({
                        effect: Effect.ALLOW,
                        actions: [
                            "dynamodb:PutItem"
                        ],
                        resources: [this.productShareMappingTable.tableArn]
                    })
                ]
            })}
        });

        NagSuppressions.addResourceSuppressions(this.workflowLambdaShareCatalogItemRole, [
            {
                id: "AwsSolutions-IAM4",
                reason: "Basic logging functionality and LF cross account capability"
            },
            {
                id: "AwsSolutions-IAM5",
                reason: "Permissions are managed at Lake Formation level.",
                appliesTo: ["Resource::*"]
            }
        ])

        this.workflowLambdaTableDetailsRole = new Role(this, "WorkflowLambdaTableDetailsRole", {
            assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
            managedPolicies: [ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole")],
            inlinePolicies: {inline0: new PolicyDocument({
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
            })}
        });

        NagSuppressions.addResourceSuppressions(this.workflowLambdaTableDetailsRole, [
            {
                id: "AwsSolutions-IAM4",
                reason: "Basic logging functionality"
            },
            {
                id: "AwsSolutions-IAM5",
                reason: "Permissions are managed at Lake Formation level.",
                appliesTo: ["Resource::*"]
            }
        ])

        this.stateMachineWorkflowRole = new Role(this, "DataLakeWorkflowRole", {
            assumedBy: new ServicePrincipal("states.amazonaws.com"),
            inlinePolicies: {
                "AllowEmitEvent": new PolicyDocument({
                    statements: [
                        new PolicyStatement({
                            effect: Effect.ALLOW,
                            actions: ["events:PutEvents"],
                            resources: [props.centralEventBusArn]
                        })
                    ]
                })
            }
        });

        const deriveBaseDatabaseName = new Function(this, "DeriveBaseDatabaseName", {
            runtime: Runtime.NODEJS_LATEST,
            handler: 'index.handler',
            code: Code.fromAsset(__dirname+"/resources/lambda/DeriveBaseDatabaseName")
        });

        NagSuppressions.addResourceSuppressions(deriveBaseDatabaseName, [
            {
                id: "AwsSolutions-IAM4",
                reason: "Basic logging"
            }
        ], true);

        const workflowSendApprovalNotification = new Function(this, "WorkflowSendApprovalNotification", {
            runtime: Runtime.NODEJS_LATEST,
            handler: 'index.handler',
            code: Code.fromAsset(__dirname+"/resources/lambda/WorkflowSendApprovalNotification"),
            role: this.workflowLambdaSendApprovalEmailRole,
            environment: {
                APPROVALS_TABLE_NAME: this.approvalsTable.tableName,
                PRODUCT_SHARE_MAPPING_TABLE_NAME: this.productShareMappingTable.tableName
            },
            layers: [this.approvalsLayer]
        });

        const workflowGetTableDetails = new Function(this, "WorkflowGetTableDetails", {
            runtime: Runtime.NODEJS_LATEST,
            handler: 'index.handler',
            code: Code.fromAsset(__dirname+"/resources/lambda/WorkflowGetTableDetails"),
            role: this.workflowLambdaTableDetailsRole
        });

        const workflowShareCatalogItem = new Function(this, "WorkflowShareCatalogItem", {
            runtime: Runtime.NODEJS_LATEST,
            handler: 'index.handler',
            code: Code.fromAsset(__dirname+"/resources/lambda/WorkflowShareCatalogItem"),
            role: this.workflowLambdaShareCatalogItemRole,
            environment: {
                MAPPING_TABLE_NAME: this.productShareMappingTable.tableName
            }
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
                        "database_name": "data-products",
                        "producer_acc_id.$": "$.derivedDbName.Payload.producer_acc_id",
                        "table_names.$": "States.Array($.source.table)",
                        "lf_access_mode": "nrac"
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

        NagSuppressions.addResourceSuppressions(this.stateMachineWorkflowRole, [
            {
                id: "AwsSolutions-IAM5",
                reason: "Broader permissions required due to the very dynamic nature of the state machine."
            }
        ], true)

        NagSuppressions.addResourceSuppressions(this.stateMachine, [
            {
                id: "AwsSolutions-SF1",
                reason: "Logging is not required"
            },
            {
                id: "AwsSolutions-SF2",
                reason: "X-Ray is not required"
            }
        ], true);

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
                          "DatabaseName.$": "$.database_name",
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
                          "DatabaseName.$": "$.database_name",
                          "TableWildcard": {}
                        }
                    }
                },
                resultPath: JsonPath.DISCARD,
                inputPath: "$.payload"
            });

            const lfAdminRole = Role.fromRoleArn(this, "DPMLFAdminRole", props.dpmStateMachineRoleArn);

            const initialState = new Pass(this, "InitialState", {
                inputPath: "$.detail.input",
                parameters: {
                    "payload.$": "States.StringToJson($)"
                }
            })

            grantWorkflowLambdaShareCatalogPermission.endStates;

            grantWorkflowLambdaTableDetailsPermission.next(grantWorkflowLambdaShareCatalogPermission);

            initialState.next(grantWorkflowLambdaTableDetailsPermission);

            const workflowNewProductAuthFlow = new StateMachine(this, "WorkflowNewProductAuthFlow", {
                definition: initialState,
                role: lfAdminRole,
                stateMachineType: StateMachineType.STANDARD
            });

            NagSuppressions.addResourceSuppressions(workflowNewProductAuthFlow, [
                {
                    id: "AwsSolutions-SF1",
                    reason: "Logging is not required"
                },
                {
                    id: "AwsSolutions-SF2",
                    reason: "X-Ray is not required"
                }
            ], true);

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

            NagSuppressions.addResourceSuppressions(lfAdminRole, [
                {
                    id: "AwsSolutions-IAM5",
                    reason: "Permissions are managed in Lake Formation",
                    appliesTo: ["Resource::*"]
                }
            ], true)
        }
    }
}