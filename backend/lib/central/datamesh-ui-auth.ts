import { CorsHttpMethod, HttpApi } from "@aws-cdk/aws-apigatewayv2-alpha";
import { HttpUserPoolAuthorizer } from "@aws-cdk/aws-apigatewayv2-authorizers-alpha";
import { HttpLambdaIntegration } from "@aws-cdk/aws-apigatewayv2-integrations-alpha";
import { IdentityPool, UserPoolAuthenticationProvider } from "@aws-cdk/aws-cognito-identitypool-alpha";
import { CfnOutput, CustomResource, Duration, RemovalPolicy } from "aws-cdk-lib";
import { UserPool, UserPoolClient } from "aws-cdk-lib/aws-cognito";
import { HttpMethod } from "aws-cdk-lib/aws-events";
import { IRole, ManagedPolicy, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { CfnDataLakeSettings } from "aws-cdk-lib/aws-lakeformation";
import { Code, Function, Runtime } from "aws-cdk-lib/aws-lambda";
import { Provider } from "aws-cdk-lib/custom-resources";
import { NagSuppressions } from "cdk-nag";
import { Construct } from "constructs";

export class DataMeshUIAuth extends Construct {
    readonly userPool: UserPool;
    readonly identityPool: IdentityPool;
    readonly httpApi: HttpApi
    readonly crDataDomainUIAccessRole: IRole

    constructor(scope: Construct, id: string) {
        super(scope, id);

        const userPool = new UserPool(this, "DataMeshUICognitoUserPool", {
            standardAttributes: {
                email: {
                    required: true
                }
            },
            passwordPolicy: {
                minLength: 8,
                requireSymbols: true,
                requireLowercase: true,
                requireUppercase: true,
                requireDigits: true
            },
            selfSignUpEnabled: true,
            autoVerify: {
                email: true
            }
        });

        userPool.applyRemovalPolicy(RemovalPolicy.DESTROY);

        this.userPool = userPool;

        const client = new UserPoolClient(this, "DataMeshUICognitoUserPoolWebClient", {
            userPool: userPool,
            userPoolClientName: "WebClient"
        });

        const identityProvider = new IdentityPool(this, "DataMeshUICognitoIdentityPool", {
            allowUnauthenticatedIdentities: false
        });    

        identityProvider.addUserPoolAuthentication(new UserPoolAuthenticationProvider({userPool, userPoolClient: client}));

        identityProvider.applyRemovalPolicy(RemovalPolicy.DESTROY);

        this.identityPool = identityProvider;

        NagSuppressions.addResourceSuppressions(userPool, [
            {
                id: "AwsSolutions-COG3",
                reason: "Advanced security not required"
            }
        ])

        const crDataDomainUIAccessRole = new Role(this, "CRDataDomainUIAccessRole", {
            assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
            managedPolicies: [ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"), ManagedPolicy.fromAwsManagedPolicyName("AWSLakeFormationDataAdmin")],
        });

        // new CfnDataLakeSettings(this, "LakeFormationSettings", {
        //     admins: [
        //         {
        //             dataLakePrincipalIdentifier: crDataDomainUIAccessRole.roleArn
        //         }
        //     ]
        // });

        this.crDataDomainUIAccessRole = crDataDomainUIAccessRole

        const crDataDomainUIAccessFunction = new Function(this, "CRDataDomainUIAccessFunction", {
            runtime: Runtime.NODEJS_16_X,
            handler: "index.handler",
            role: crDataDomainUIAccessRole,
            code: Code.fromAsset(__dirname+"/resources/lambda/CRDataDomainUIAccess"),
            memorySize: 256,
            environment: {
                ROLE_TO_GRANT: identityProvider.authenticatedRole.roleArn
            }
        });

        const crDataDomainUIAccessProvider = new Provider(this, "CRDataDomainUIAccessProvider", {
            onEventHandler: crDataDomainUIAccessFunction
        })

        new CustomResource(this, "CRDataDomainUIAccessResource", {serviceToken: crDataDomainUIAccessProvider.serviceToken})

        new CfnOutput(this, "CognitoAuthRoleArn", {
            value: identityProvider.authenticatedRole.roleArn
        });

        new CfnOutput(this, "UserPoolId", {
            value: userPool.userPoolId
        });

        new CfnOutput(this, "ClientId", {
            value: client.userPoolClientId
        });

        new CfnOutput(this, "IdentityPoolId", {
            value: identityProvider.identityPoolId
        })

        const httpApiUserPoolAuthorizer = new HttpUserPoolAuthorizer("WorkflowHttpAPIUserPoolAuthorizer", userPool, {
            userPoolClients: [client]
        });

        const syncDataDomainUIPermissionsFunction = new Function(this, "SyncDataDomainUIPermissionsFunction", {
            runtime: Runtime.NODEJS_16_X,
            handler: "index.handler",
            role: crDataDomainUIAccessRole,
            code: Code.fromAsset(__dirname+"/resources/lambda/SyncDataDomainUIPermissions"),
            memorySize: 256,
            environment: {
                ROLE_TO_GRANT: identityProvider.authenticatedRole.roleArn
            }
        });

        this.httpApi = new HttpApi(this, "DataLakeWorkflowAPIGW", {
            corsPreflight: {
                allowOrigins: ["*"],
                allowHeaders: ["Authorization", "Content-Type"],
                allowMethods: [
                    CorsHttpMethod.ANY
                ],
                maxAge: Duration.days(1)
            },
            defaultAuthorizer: httpApiUserPoolAuthorizer
        });

        this.httpApi.addRoutes({
            path: "/data-domains/sync-permissions",
            methods: [HttpMethod.POST],
            integration: new HttpLambdaIntegration("SyncDataDomainUIPermissionsIntegration", syncDataDomainUIPermissionsFunction)
        })
    }
}