import { HttpApi } from "@aws-cdk/aws-apigatewayv2-alpha";
import { HttpUserPoolAuthorizer } from "@aws-cdk/aws-apigatewayv2-authorizers-alpha";
import { HttpLambdaIntegration } from "@aws-cdk/aws-apigatewayv2-integrations-alpha";
import { Duration, RemovalPolicy } from "aws-cdk-lib";
import { Table } from "aws-cdk-lib/aws-dynamodb";
import { HttpMethod } from "aws-cdk-lib/aws-events";
import { Effect, IRole, ManagedPolicy, PolicyDocument, PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { CfnDataLakeSettings } from "aws-cdk-lib/aws-lakeformation";
import { Code, Function, LayerVersion, Runtime } from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
const tbacConfig  = require("../../../src/tbac-config.json")

export interface DataDomainManagementProps {
    uiAuthenticatedRole: IRole
    centralWorkflowRole: IRole
    httpApi: HttpApi
    centralEventBusArn: string
    adjustGlueResourcePolicyFunction: Function
    userDomainMappingTable: Table
    approvalsTable: Table
    productShareMappingTable: Table
    crDataDomainUIAccessRole: IRole
    confidentialityKey: string
    approvalsLayer: LayerVersion
}

export class DataDomainManagement extends Construct {
    readonly registerDataDomainRole: IRole
    readonly dataDomainLayer: LayerVersion

    constructor(scope: Construct, id: string, props: DataDomainManagementProps) {
        super(scope, id)

        this.dataDomainLayer = new LayerVersion(this, "DataDomainLayer", {
            code: Code.fromAsset(__dirname+"/resources/lambda/layers/data-domain"),
            compatibleRuntimes: [Runtime.NODEJS_LATEST],
            removalPolicy: RemovalPolicy.DESTROY
        })

        const crossAccountEbRole = new Role(this, "EventBridgeCrossAccountRole", {
            assumedBy: new ServicePrincipal("events.amazonaws.com"),
            inlinePolicies: {inline0: new PolicyDocument({
                statements: [
                    new PolicyStatement({
                        effect: Effect.ALLOW,
                        actions: [
                            "events:PutEvents"
                        ],
                        resources: [
                            "arn:aws:events:*:*:event-bus/data-mesh-bus"
                        ]
                    })
                ]
            })}
        })

        const registerDataDomainRole = new Role(this, "RegisterDataDomainRole", {
            assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
            managedPolicies: [ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole")],
            inlinePolicies: {inline0: new PolicyDocument({
                statements: [
                    new PolicyStatement({
                        effect: Effect.ALLOW,
                        actions: [
                            "lakeformation:*",
                            "glue:*",
                            "iam:CreateRole",
                            "iam:PutRolePolicy",
                            "events:PutRule",
                            "events:PutPermission",
                            "events:PutTargets",
                            "kms:Decrypt"
                        ],
                        resources: ["*"]
                    }),
                    new PolicyStatement({
                        effect: Effect.ALLOW,
                        actions: [
                            "secretsmanager:GetSecretValue"
                        ],
                        resources: [
                            "arn:aws:secretsmanager:*:*:secret:domain-config-*"
                        ]
                    }),
                    new PolicyStatement({
                        effect: Effect.ALLOW,
                        actions: [
                            "iam:GetRole",
                            "iam:PassRole"
                        ],
                        resources: [
                            "arn:aws:iam::*:role/data-domain-*-accessRole",
                            crossAccountEbRole.roleArn
                        ]
                    }),
                    new PolicyStatement({
                        effect: Effect.ALLOW,
                        actions: [
                            "lambda:InvokeFunction"
                        ],
                        resources: [
                            props.adjustGlueResourcePolicyFunction.functionArn
                        ]
                    }),
                    new PolicyStatement({
                        effect: Effect.ALLOW,
                        actions: [
                            "dynamodb:PutItem"
                        ],
                        resources: [
                            props.userDomainMappingTable.tableArn
                        ]
                    })
                ]
            })}
        });

        this.registerDataDomainRole = registerDataDomainRole

        // new CfnDataLakeSettings(this, "LakeFormationSettings", {
        //     admins: [
        //         {
        //             dataLakePrincipalIdentifier: registerDataDomainRole.roleArn
        //         }
        //     ]
        // });

        const registerDataDomainFunction = new Function(this, "RegisterDataDomainFunction", {
            runtime: Runtime.NODEJS_LATEST,
            role: registerDataDomainRole,
            handler: "index.handler",
            timeout: Duration.seconds(30),
            code: Code.fromAsset(__dirname+"/resources/lambda/RegisterDataDomain"),
            environment: {
                UI_AUTH_ROLE_ARN: props.uiAuthenticatedRole.roleArn,
                WORKFLOW_ROLE_ARN: props.centralWorkflowRole.roleArn,
                DOMAIN_TAG_KEY: tbacConfig.TagKeys.LineOfBusiness,
                CONFIDENTIALITY_TAG_KEY: tbacConfig.TagKeys.Confidentiality,
                DEFAULT_CONFIDENTIALITY: tbacConfig.DefaultValues[tbacConfig.TagKeys.Confidentiality],
                CENTRAL_EVENT_BUS_ARN: props.centralEventBusArn,
                LAMBDA_EXEC_ROLE_ARN: registerDataDomainRole.roleArn,
                EB_XACCOUNT_ROLE_ARN: crossAccountEbRole.roleArn,
                ADJUST_RESOURCE_POLICY_FUNC_NAME: props.adjustGlueResourcePolicyFunction.functionName,
                USER_MAPPING_TABLE_NAME: props.userDomainMappingTable.tableName
            }
        })

        props.httpApi.addRoutes({
            path: "/data-domain/register",
            methods: [HttpMethod.POST],
            integration: new HttpLambdaIntegration("RegisterDataDomainIntegration", registerDataDomainFunction)
        })

        const getDataDomainOwnerRole = new Role(this, "GetDataDomainOwnerRole", {
            assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
            managedPolicies: [ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole")],
            inlinePolicies: {inline0: new PolicyDocument({
                statements: [
                    new PolicyStatement({
                        effect: Effect.ALLOW,
                        actions: [
                            "dynamodb:GetItem"
                        ],
                        resources: [
                            props.userDomainMappingTable.tableArn
                        ]
                    })
                ]
            })}
        });

        const getDataDomainOwnerFunction = new Function(this, "GetDataDomainOwnerFunction", {
            runtime: Runtime.NODEJS_LATEST,
            role: getDataDomainOwnerRole,
            handler: "index.handler",
            timeout: Duration.seconds(30),
            code: Code.fromAsset(__dirname+"/resources/lambda/GetDataDomainOwner"),
            environment: {
                USER_MAPPING_TABLE_NAME: props.userDomainMappingTable.tableName
            }
        })

        props.httpApi.addRoutes({
            path: "/data-domain/validate-owner",
            methods: [HttpMethod.GET],
            integration: new HttpLambdaIntegration("GetDataDomainOwnerIntegration", getDataDomainOwnerFunction)
        })

        const getUserDataDomainsRole = new Role(this, "GetUserDataDomainsRole", {
            assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
            managedPolicies: [ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole")],
            inlinePolicies: {inline0: new PolicyDocument({
                statements: [
                    new PolicyStatement({
                        effect: Effect.ALLOW,
                        actions: [
                            "dynamodb:Query"
                        ],
                        resources: [
                            props.userDomainMappingTable.tableArn
                        ]
                    })
                ]
            })}
        });

        const getUserDataDomainsFunction = new Function(this, "GetUserDataDomainsFunction", {
            runtime: Runtime.NODEJS_LATEST,
            role: getUserDataDomainsRole,
            handler: "index.handler",
            timeout: Duration.seconds(30),
            code: Code.fromAsset(__dirname+"/resources/lambda/GetUserDataDomains"),
            environment: {
                USER_MAPPING_TABLE_NAME: props.userDomainMappingTable.tableName
            }
        })

        props.httpApi.addRoutes({
            path: "/data-domain/list",
            methods: [HttpMethod.GET],
            integration: new HttpLambdaIntegration("GetUserDataDomainsIntegration", getUserDataDomainsFunction)
        })

        const getPendingShareApprovalsRole = new Role(this, "GetPendingShareApprovalsRole", {
            assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
            managedPolicies: [ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole")],
            inlinePolicies: {inline0: new PolicyDocument({
                statements: [
                    new PolicyStatement({
                        effect: Effect.ALLOW,
                        actions: [
                            "dynamodb:Query"
                        ],
                        resources: [
                            props.approvalsTable.tableArn
                        ]
                    }),
                    new PolicyStatement({
                        effect: Effect.ALLOW,
                        actions: [
                            "dynamodb:GetItem",
                            "dynamodb:Query"
                        ],
                        resources: [
                            props.userDomainMappingTable.tableArn
                        ]
                    })
                ]
            })}
        });

        const getPendingShareApprovalsFunction = new Function(this, "GetPendingShareApprovalsFunction", {
            runtime: Runtime.NODEJS_LATEST,
            role: getPendingShareApprovalsRole,
            handler: "index.handler",
            timeout: Duration.seconds(30),
            code: Code.fromAsset(__dirname+"/resources/lambda/GetPendingShareApprovals"),
            environment: {
                USER_MAPPING_TABLE_NAME: props.userDomainMappingTable.tableName,
                APPROVALS_TABLE_NAME: props.approvalsTable.tableName
            },
            layers: [this.dataDomainLayer]
        })

        props.httpApi.addRoutes({
            path: "/data-domains/pending-approvals",
            methods: [HttpMethod.GET],
            integration: new HttpLambdaIntegration("GetPendingShareApprovalsIntegration", getPendingShareApprovalsFunction),
        })

        const togglePIIFlagFunction = new Function(this, "TogglePIIFlagFunction", {
            runtime: Runtime.NODEJS_LATEST,
            role: props.crDataDomainUIAccessRole,
            handler: "index.handler",
            timeout: Duration.seconds(30),
            code: Code.fromAsset(__dirname+"/resources/lambda/TogglePIIFlag"),
            environment: {
                USER_MAPPING_TABLE_NAME: props.userDomainMappingTable.tableName,
                LAMBDA_EXEC_ROLE_ARN: props.crDataDomainUIAccessRole.roleArn,
                CONFIDENTIALITY_KEY: props.confidentialityKey
            },
            layers: [this.dataDomainLayer]
        })

        props.httpApi.addRoutes({
            path: "/data-products/toggle-pii-flag",
            methods: [HttpMethod.POST],
            integration: new HttpLambdaIntegration("togglePIIFlagIntegration", togglePIIFlagFunction),
        })

        const processApprovalRole = new Role(this, "ProcessApprovalRole", {
            assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
            managedPolicies: [ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole")],
            inlinePolicies: {inline0: new PolicyDocument({
                statements: [
                    new PolicyStatement({
                        effect: Effect.ALLOW,
                        actions: [
                            "dynamodb:GetItem"
                        ],
                        resources: [
                            props.userDomainMappingTable.tableArn
                        ]
                    }),
                    new PolicyStatement({
                        effect: Effect.ALLOW,
                        actions: [
                            "dynamodb:GetItem",
                            "dynamodb:UpdateItem",
                            "dynamodb:DeleteItem",
                            "dynamodb:TransactWriteItems"
                        ],
                        resources: [
                            props.approvalsTable.tableArn,
                            props.productShareMappingTable.tableArn
                        ]
                    }),
                    new PolicyStatement({
                        effect: Effect.ALLOW,
                        actions: [
                            "states:SendTaskFailure",
                            "states:SendTaskSuccess"
                        ],
                        resources: ["*"]
                    })
                ]
            })}
        });

        const processApprovalFunction = new Function(this, "ProcessApprovalFunction", {
            runtime: Runtime.NODEJS_LATEST,
            role: processApprovalRole,
            handler: "index.handler",
            timeout: Duration.seconds(30),
            code: Code.fromAsset(__dirname+"/resources/lambda/ProcessApproval"),
            environment: {
                USER_MAPPING_TABLE_NAME: props.userDomainMappingTable.tableName,
                APPROVALS_TABLE_NAME: props.approvalsTable.tableName,
                PRODUCT_SHARE_MAPPING_TABLE_NAME: props.productShareMappingTable.tableName
            },
            layers: [this.dataDomainLayer, props.approvalsLayer]
        })

        props.httpApi.addRoutes({
            path: "/data-domains/process-approval",
            methods: [HttpMethod.POST],
            integration: new HttpLambdaIntegration("processApprovalIntegration", processApprovalFunction),
        })

        const getPendingApprovalCountRole = new Role(this, "GetPendingApprovalCountRole", {
            assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
            managedPolicies: [ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole")],
            inlinePolicies: {inline0: new PolicyDocument({
                statements: [
                    new PolicyStatement({
                        effect: Effect.ALLOW,
                        actions: [
                            "dynamodb:GetItem",
                            "dynamodb:Query"
                        ],
                        resources: [
                            props.userDomainMappingTable.tableArn
                        ]
                    }),
                    new PolicyStatement({
                        effect: Effect.ALLOW,
                        actions: [
                            "dynamodb:GetItem",
                        ],
                        resources: [
                            props.approvalsTable.tableArn
                        ]
                    })
                ]
            })}
        });

        const getPendingApprovalCountFunction = new Function(this, "GetPendingApprovalCountFunction", {
            runtime: Runtime.NODEJS_LATEST,
            role: getPendingApprovalCountRole,
            handler: "index.handler",
            timeout: Duration.seconds(30),
            code: Code.fromAsset(__dirname+"/resources/lambda/GetPendingApprovalCount"),
            environment: {
                USER_MAPPING_TABLE_NAME: props.userDomainMappingTable.tableName,
                APPROVALS_TABLE_NAME: props.approvalsTable.tableName
            },
            layers: [this.dataDomainLayer, props.approvalsLayer]
        })

        props.httpApi.addRoutes({
            path: "/data-domains/pending-approval-count",
            methods: [HttpMethod.GET],
            integration: new HttpLambdaIntegration("getPendingApprovalCountIntegration", getPendingApprovalCountFunction),
        })
    }
}