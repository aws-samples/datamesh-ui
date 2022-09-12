import { HttpApi } from "@aws-cdk/aws-apigatewayv2-alpha";
import { HttpUserPoolAuthorizer } from "@aws-cdk/aws-apigatewayv2-authorizers-alpha";
import { HttpLambdaIntegration } from "@aws-cdk/aws-apigatewayv2-integrations-alpha";
import { Duration } from "aws-cdk-lib";
import { HttpMethod } from "aws-cdk-lib/aws-events";
import { Effect, IRole, ManagedPolicy, PolicyDocument, PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { CfnDataLakeSettings } from "aws-cdk-lib/aws-lakeformation";
import { Code, Function, Runtime } from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
const tbacConfig  = require("../../../src/tbac-config.json")

export interface DataDomainManagementProps {
    uiAuthenticatedRole: IRole
    centralWorkflowRole: IRole
    httpApi: HttpApi
    httpiApiUserPoolAuthorizer: HttpUserPoolAuthorizer
    centralEventBusArn: string
}

export class DataDomainManagement extends Construct {
    constructor(scope: Construct, id: string, props: DataDomainManagementProps) {
        super(scope, id)

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
                            "arn:aws:iam::*:role/data-domain-*-accessRole"
                        ]
                    })
                ]
            })}
        });

        new CfnDataLakeSettings(this, "LakeFormationSettings", {
            admins: [
                {
                    dataLakePrincipalIdentifier: registerDataDomainRole.roleArn
                }
            ]
        });

        const registerDataDomainFunction = new Function(this, "RegisterDataDomainFunction", {
            runtime: Runtime.NODEJS_16_X,
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
                LAMBDA_EXEC_ROLE_ARN: registerDataDomainRole.roleArn
            }
        })

        props.httpApi.addRoutes({
            path: "/data-domain/register",
            methods: [HttpMethod.POST],
            integration: new HttpLambdaIntegration("RegisterDataDomainIntegration", registerDataDomainFunction),
            authorizer: props.httpiApiUserPoolAuthorizer
        })
    }
}