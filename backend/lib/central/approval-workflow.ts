import { CorsHttpMethod, HttpApi } from "@aws-cdk/aws-apigatewayv2-alpha";
import { HttpLambdaIntegration } from "@aws-cdk/aws-apigatewayv2-integrations-alpha";
import { IdentityPool, UserPoolAuthenticationProvider } from "@aws-cdk/aws-cognito-identitypool-alpha";
import { Duration, RemovalPolicy, Stack } from "aws-cdk-lib";
import { UserPool } from "aws-cdk-lib/aws-cognito";
import { EventBus, EventField, Rule, RuleTargetInput } from "aws-cdk-lib/aws-events";
import { SfnStateMachine } from "aws-cdk-lib/aws-events-targets";
import { Effect, FederatedPrincipal, ManagedPolicy, Policy, PolicyDocument, PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { Code, Function, Runtime } from "aws-cdk-lib/aws-lambda";
import { Choice, Condition, IntegrationPattern, JsonPath, Pass, StateMachine, StateMachineType, TaskInput } from "aws-cdk-lib/aws-stepfunctions";
import { CallAwsService, HttpMethod, LambdaInvoke } from "aws-cdk-lib/aws-stepfunctions-tasks";
import { NagSuppressions } from "cdk-nag";
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
    readonly centralApprovalEventBus: EventBus;
    readonly approvalBaseUrl: string;
    readonly httpApi: HttpApi;

    constructor(scope: Construct, id: string, props:ApprovalWorkflowProps) {
        super(scope, id);
        
        //event bus for workflow
        const centralApprovalEventBus = new EventBus(this, "CentralApprovalEventBus", {
            eventBusName: util.format("%s_centralApprovalBus", Stack.of(this).account)
        });

        this.centralApprovalEventBus = centralApprovalEventBus;

        centralApprovalEventBus.applyRemovalPolicy(RemovalPolicy.DESTROY);

        const eventBridgeCrossAccountRole = new Role(this, "EventBridgeCrossAccountRole", {
            assumedBy: new ServicePrincipal("events.amazonaws.com"),
            inlinePolicies: {
                "AllowPutEvents": new PolicyDocument({
                    statements: [
                        new PolicyStatement({
                            effect: Effect.ALLOW,
                            actions: ["events:PutEvents"],
                            resources: ["arn:aws:events:*:*:event-bus/*_sharingApprovalBus"]
                        })
                    ]
                })
            }
        })

        NagSuppressions.addResourceSuppressions(eventBridgeCrossAccountRole, [{
            id: "AwsSolutions-IAM5",
            reason: "Used by Step Function to dynamically create EventBridge Rule Targets for new data products.",
            appliesTo: ["Resource::arn:aws:events:*:*:event-bus/*_sharingApprovalBus"]
        }])

        this.workflowLambdaSMApproverRole = new Role(this, "WorkflowLambdaSMApproverRole", {
            assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
            managedPolicies: [ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole")],
            inlinePolicies: {inline0: new PolicyDocument({
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
            })}
        });

        NagSuppressions.addResourceSuppressions(this.workflowLambdaSMApproverRole, [
            {
                id: "AwsSolutions-IAM4",
                reason: "Basic logging functionality"
            },
            {
                id: "AwsSolutions-IAM5",
                reason: "Activities are created dynamically"
            }
        ])

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

        const workflowActivityApprover = new Function(this, "WorkflowActivityApprover", {
            runtime: Runtime.NODEJS_16_X,
            handler: 'index.handler',
            code: Code.fromAsset(__dirname+"/resources/lambda/WorkflowActivityApprover"),
            role: this.workflowLambdaSMApproverRole
        });

        const httpApi = new HttpApi(this, "DataLakeWorkflowAPIGW", {
            corsPreflight: {
                allowOrigins: ["*"],
                allowHeaders: ["Authorization", "Content-Type"],
                allowMethods: [
                    CorsHttpMethod.ANY
                ],
                maxAge: Duration.days(1)
            }
        });

        httpApi.addRoutes({
            path: '/workflow/update-state',
            methods: [HttpMethod.GET],
            integration: new HttpLambdaIntegration("ApprovalStateIntegration", workflowActivityApprover)
        });

        NagSuppressions.addResourceSuppressions(httpApi, [
            {
                id: "AwsSolutions-APIG1",
                reason: "API is only used for access approvals."
            },
            {
                id: "AwsSolutions-APIG4",
                reason: "Endpoint requires a task token before proceeding."
            }
        ], true)

        const deriveBaseDatabaseName = new Function(this, "DeriveBaseDatabaseName", {
            runtime: Runtime.NODEJS_16_X,
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
            runtime: Runtime.NODEJS_16_X,
            handler: 'index.handler',
            code: Code.fromAsset(__dirname+"/resources/lambda/WorkflowSendApprovalNotification"),
            role: this.workflowLambdaSendApprovalEmailRole,
            environment: {
                "API_GATEWAY_BASE_URL": httpApi.apiEndpoint+"/workflow",
                "CENTRAL_APPROVAL_BUS_NAME": centralApprovalEventBus.eventBusName
            }
        });

        this.approvalBaseUrl = httpApi.apiEndpoint+"/workflow";
        this.httpApi = httpApi;

        const workflowGetTableDetails = new Function(this, "WorkflowGetTableDetails", {
            runtime: Runtime.NODEJS_16_X,
            handler: 'index.handler',
            code: Code.fromAsset(__dirname+"/resources/lambda/WorkflowGetTableDetails"),
            role: this.workflowLambdaTableDetailsRole
        });

        const workflowShareCatalogItem = new Function(this, "WorkflowShareCatalogItem", {
            runtime: Runtime.NODEJS_16_X,
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

            const approvalRuleArn = util.format("arn:aws:events:%s:%s:rule/%s/*", Stack.of(this).region, Stack.of(this).account, centralApprovalEventBus.eventBusName);
            lfAdminRole.attachInlinePolicy(new Policy(this, "eventBridgePassRolePolicy", {
                document: new PolicyDocument({
                    statements: [
                        new PolicyStatement({
                            effect: Effect.ALLOW,
                            actions: ["events:Put*"],
                            resources: [centralApprovalEventBus.eventBusArn, approvalRuleArn]
                        }),
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