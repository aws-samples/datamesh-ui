import { IdentityPool, UserPoolAuthenticationProvider } from "@aws-cdk/aws-cognito-identitypool-alpha";
import { CfnOutput, RemovalPolicy } from "aws-cdk-lib";
import { UserPool, UserPoolClient } from "aws-cdk-lib/aws-cognito";
import { NagSuppressions } from "cdk-nag";
import { Construct } from "constructs";

export class DataMeshUIAuth extends Construct {
    readonly userPool: UserPool;
    readonly identityPool: IdentityPool;

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
    }
}