import { HttpApi, CorsHttpMethod } from "@aws-cdk/aws-apigatewayv2-alpha";
import { CfnOutput, Duration, Stack, StackProps } from "aws-cdk-lib";
import { HttpLambdaIntegration } from "@aws-cdk/aws-apigatewayv2-integrations-alpha";
import { HttpJwtAuthorizer } from '@aws-cdk/aws-apigatewayv2-authorizers-alpha';
import { UserPool } from "aws-cdk-lib/aws-cognito";
import { Effect, FederatedPrincipal, ManagedPolicy, Policy, PolicyDocument, PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { Code, Function, Runtime } from "aws-cdk-lib/aws-lambda";
import { Choice, Condition, IntegrationPattern, JsonPath, StateMachine, StateMachineType, TaskInput } from "aws-cdk-lib/aws-stepfunctions";
import { HttpMethod, LambdaInvoke } from "aws-cdk-lib/aws-stepfunctions-tasks";
import { Construct } from "constructs";
import * as databrew from 'aws-cdk-lib/aws-databrew';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cdk from 'aws-cdk-lib';
const util = require("util");

export class DataQualityCentralAccount extends Construct {
  
    readonly dataQualityEndpoint: string;
     
    constructor(scope: Construct, id: string) {
    
        super(scope, id);
   
        const dataQualityHttpApi = new HttpApi(this, "DataQualityAPIGW", {
                
            corsPreflight: {
                allowHeaders: ['*'],
                allowMethods: [
                  CorsHttpMethod.GET,
                  CorsHttpMethod.OPTIONS,
                  CorsHttpMethod.POST,
                ],
                allowOrigins: ['*'],
                maxAge: Duration.days(0),
            },
        });
    

        const productPolicyDoc = new PolicyDocument({
            statements: [
                new PolicyStatement({
                    effect: Effect.ALLOW,
                    actions: [
                        "sts:AssumeRole"
                    ],
                    resources: ["arn:aws:iam::*:role/ProducerWorkflowRole"]
                })
            ]
        });
    
        const dataQualityReportsRole = new Role(this, "DataQualityReportsRole", {
                assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
                managedPolicies: [ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole")],
                inlinePolicies: {inline0: productPolicyDoc}
        });
        
        const dataQualityReports = new Function(this, "DataQualityReports", {
            runtime: Runtime.NODEJS_14_X,
            handler: 'index.handler',
            timeout: Duration.seconds(30),
            code: Code.fromAsset(__dirname+"/resources/lambda/DataQualityReports"),
            role: dataQualityReportsRole
        });
    
        const dataQualityReportResultsRole = new Role(this, "DataQualityReportResultsRole", {
                assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
                managedPolicies: [ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole")],
                inlinePolicies: {inline0: productPolicyDoc}
        });
        
        const dataQualityReportResults = new Function(this, "DataQualityReportResults", {
            runtime: Runtime.NODEJS_14_X,
            handler: 'index.handler',
            timeout: Duration.seconds(30),
            code: Code.fromAsset(__dirname+"/resources/lambda/DataQualityReportResults"),
            role: dataQualityReportResultsRole
        });
    
    
        // TODO : Hardcoded for now
        // const issuer = "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_rJ89t8zp4";
        
        // const authorizer = new HttpJwtAuthorizer('WorkflowUIAuthorizer', issuer, {
        //   jwtAudience: ['7v4uca2fnkh1nrljdp1lqvkq6r'],
        // });


        dataQualityHttpApi.addRoutes({
            path: '/data_quality/data_quality_reports',
            methods: [HttpMethod.GET],
            integration: new HttpLambdaIntegration("DataQualityReportsIntegration", dataQualityReports),
            //authorizer: authorizer
        });
        
        dataQualityHttpApi.addRoutes({
            path: '/data_quality/data_quality_reports',
            methods: [HttpMethod.OPTIONS],
            integration: new HttpLambdaIntegration("DataQualityReportsIntegration", dataQualityReports)
        });
        
        dataQualityHttpApi.addRoutes({
            path: '/data_quality/report_results',
            methods: [HttpMethod.GET],
            integration: new HttpLambdaIntegration("DataQualityReportResultsIntegration", dataQualityReportResults),
            //authorizer: authorizer
        });
        
        dataQualityHttpApi.addRoutes({
            path: '/data_quality/report_results',
            methods: [HttpMethod.OPTIONS],
            integration: new HttpLambdaIntegration("DataQualityReportResultsIntegration", dataQualityReportResults)
        });
        
        new CfnOutput(this, 'dataQualityHttpApiUrl', {
            value: dataQualityHttpApi.url!
        });
        
        this.dataQualityEndpoint = dataQualityHttpApi.url!;
    }
}
