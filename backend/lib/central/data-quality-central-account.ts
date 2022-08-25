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
import { NagSuppressions } from "cdk-nag";

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

        const dataQualityReportsRole = new Role(
            this,
            "DataQualityReportsRole",
            {
                assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
                managedPolicies: [
                    ManagedPolicy.fromAwsManagedPolicyName(
                        "service-role/AWSLambdaBasicExecutionRole"
                    ),
                    ManagedPolicy.fromAwsManagedPolicyName("AmazonS3ReadOnlyAccess")
                ]
            }
        );

        NagSuppressions.addResourceSuppressions(dataQualityReportsRole, [
            {
                id: "AwsSolutions-IAM4",
                reason: "Basic logging and dynamic read access to product data locations"
            }
        ])

        const dataQualityReports = new Function(this, "DataQualityReports", {
            runtime: Runtime.NODEJS_16_X,
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
                    ManagedPolicy.fromAwsManagedPolicyName("AmazonS3ReadOnlyAccess")
                ]
            }
        );

        NagSuppressions.addResourceSuppressions(dataQualityReportResultsRole, [
            {
                id: "AwsSolutions-IAM4",
                reason: "Basic logging and dynamic read access to product data locations"
            }
        ])

        const dataQualityReportResults = new Function(
            this,
            "DataQualityReportResults",
            {
                runtime: Runtime.NODEJS_16_X,
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
        
        NagSuppressions.addResourceSuppressions(dataQualityHttpApi, [
            {
                id: "AwsSolutions-APIG1",
                reason: "API is only used for access approvals"
            },
            {
                id: "AwsSolutions-APIG2",
                reason: "Already handled separately"
            },
            {
                id: "AwsSolutions-APIG4",
                reason: "Endpoint requires a task token before proceeding"
            },
            {
                id: "AwsSolutions-APIG6",
                reason: "Not needed"
            },
            {
                id: "AwsSolutions-IAM4",
                reason: "API logging purposes"
            }
        ], true)
    }
}
