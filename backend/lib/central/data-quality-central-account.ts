import { aws_apigateway, CfnOutput, Duration } from "aws-cdk-lib";
import {
    Effect,
    ManagedPolicy,
    PolicyDocument,
    PolicyStatement,
    Role,
    ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import { Code, Function, Runtime } from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import {
    CfnMethod,
    CognitoUserPoolsAuthorizer,
    LambdaIntegration,
    LambdaRestApi,
} from "aws-cdk-lib/aws-apigateway";
import { UserPool } from "aws-cdk-lib/aws-cognito";

export interface DataQualityCentralAccountProps {
    userPool: UserPool;
}
export class DataQualityCentralAccount extends Construct {
    readonly dataQualityEndpoint: string;

    constructor(
        scope: Construct,
        id: string,
        props: DataQualityCentralAccountProps
    ) {
        super(scope, id);

        const productPolicyDoc = new PolicyDocument({
            statements: [
                new PolicyStatement({
                    effect: Effect.ALLOW,
                    actions: ["sts:AssumeRole"],
                    resources: ["arn:aws:iam::*:role/ProducerWorkflowRole"],
                }),
            ],
        });

        const dataQualityReportsRole = new Role(
            this,
            "DataQualityReportsRole",
            {
                assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
                managedPolicies: [
                    ManagedPolicy.fromAwsManagedPolicyName(
                        "service-role/AWSLambdaBasicExecutionRole"
                    ),
                ],
                inlinePolicies: { inline0: productPolicyDoc },
            }
        );

        const dataQualityReports = new Function(this, "DataQualityReports", {
            runtime: Runtime.NODEJS_14_X,
            handler: "index.handler",
            timeout: Duration.seconds(30),
            code: Code.fromAsset(
                __dirname + "/resources/lambda/DataQualityReports"
            ),
            role: dataQualityReportsRole,
        });

        const dataQualityReportResultsRole = new Role(
            this,
            "DataQualityReportResultsRole",
            {
                assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
                managedPolicies: [
                    ManagedPolicy.fromAwsManagedPolicyName(
                        "service-role/AWSLambdaBasicExecutionRole"
                    ),
                ],
                inlinePolicies: { inline0: productPolicyDoc },
            }
        );

        const dataQualityReportResults = new Function(
            this,
            "DataQualityReportResults",
            {
                runtime: Runtime.NODEJS_14_X,
                handler: "index.handler",
                timeout: Duration.seconds(30),
                code: Code.fromAsset(
                    __dirname + "/resources/lambda/DataQualityReportResults"
                ),
                role: dataQualityReportResultsRole,
            }
        );

        const cognitoAuthorizer = new CognitoUserPoolsAuthorizer(
            this,
            "CognitoUserPoolsAuthorizer",
            {
                cognitoUserPools: [props.userPool],
            }
        );

        const dataQualityHttpApi = new LambdaRestApi(
            this,
            "DataQualityAPIGWRest",
            {
                handler: dataQualityReports,
                proxy: false,
                defaultCorsPreflightOptions: {
                    allowOrigins: ["*"],
                    allowCredentials: true,
                },
                defaultMethodOptions: {
                    authorizationType: aws_apigateway.AuthorizationType.COGNITO,
                    authorizer: cognitoAuthorizer,
                },
            }
        );

        const resource = dataQualityHttpApi.root.addResource("data_quality");

        resource
            .addResource("data_quality_reports")
            .addMethod("GET", new LambdaIntegration(dataQualityReports));

        resource
            .addResource("report_results")
            .addMethod("GET", new LambdaIntegration(dataQualityReportResults));

        dataQualityHttpApi.methods
            .filter((m) => m.httpMethod === "OPTIONS")
            .forEach((m) => {
                (m?.node?.defaultChild as CfnMethod).addPropertyOverride(
                    "AuthorizationType",
                    "NONE"
                );
            });

        new CfnOutput(this, "dataQualityHttpApiUrl", {
            value: dataQualityHttpApi.url!,
        });

        this.dataQualityEndpoint = dataQualityHttpApi.url!;
    }
}
