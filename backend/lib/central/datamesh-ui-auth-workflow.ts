import { HttpApi } from "@aws-cdk/aws-apigatewayv2-alpha";
import { HttpUserPoolAuthorizer } from "@aws-cdk/aws-apigatewayv2-authorizers-alpha";
import { HttpLambdaIntegration } from "@aws-cdk/aws-apigatewayv2-integrations-alpha";
import { Duration } from "aws-cdk-lib";
import { Table } from "aws-cdk-lib/aws-dynamodb";
import { HttpMethod } from "aws-cdk-lib/aws-events";
import { Effect, ManagedPolicy, PolicyDocument, PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { Code, Function, Runtime } from "aws-cdk-lib/aws-lambda";
import { IStateMachine, StateMachine } from "aws-cdk-lib/aws-stepfunctions";
import { Construct } from "constructs";

export interface DataMeshUIAuthWorkflowProps {
    registrationWorkflow: IStateMachine
    nracApprovalWorkflow: IStateMachine
    tbacApprovalWorkflow: IStateMachine
    userMappingTable: Table
    httpApi: HttpApi
}

export class DataMeshUIAuthWorkflow extends Construct {
    constructor(scope: Construct, id: string, props: DataMeshUIAuthWorkflowProps) {
        super(scope, id)

        const authWorkflowRole = new Role(this, "AuthWorkflowRole", {
            assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
            managedPolicies: [ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole")],
            inlinePolicies: {inline0: new PolicyDocument({
                statements: [
                    new PolicyStatement({
                        effect: Effect.ALLOW,
                        actions: [
                            "dynamodb:GetItem"
                        ],
                        resources: [props.userMappingTable.tableArn]
                    }),
                    new PolicyStatement({
                        effect: Effect.ALLOW,
                        actions: [
                            "states:StartExecution"
                        ],
                        resources: [
                            props.registrationWorkflow.stateMachineArn,
                            props.nracApprovalWorkflow.stateMachineArn,
                            props.tbacApprovalWorkflow.stateMachineArn
                        ]
                    })
                ]
            })}
        });

        const authWorkflowFunction = new Function(this, "AuthWorkflowFunction", {
            runtime: Runtime.NODEJS_LATEST,
            role: authWorkflowRole,
            handler: "index.handler",
            timeout: Duration.seconds(30),
            code: Code.fromAsset(__dirname+"/resources/lambda/AuthenticatedWorkflow"),
            environment: {
                USER_MAPPING_TABLE_NAME: props.userMappingTable.tableName
            }
        }) 

        props.httpApi.addRoutes({
            path: "/workflow/exec",
            methods: [HttpMethod.POST],
            integration: new HttpLambdaIntegration("AuthWorkflowIntegration", authWorkflowFunction)
        })
    }
}