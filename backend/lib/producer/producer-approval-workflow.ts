import { Duration, Stack } from "aws-cdk-lib";
import { CfnEventBusPolicy, EventBus, Rule, RuleTargetInput } from "aws-cdk-lib/aws-events";
import { LambdaFunction, SfnStateMachine, SnsTopic } from "aws-cdk-lib/aws-events-targets";
import { AccountPrincipal, AccountRootPrincipal, ArnPrincipal, Effect, ManagedPolicy, PolicyDocument, PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { Key } from "aws-cdk-lib/aws-kms";
import { Code, Function, Runtime } from "aws-cdk-lib/aws-lambda";
import { Topic } from "aws-cdk-lib/aws-sns";
import { Choice, Condition, JsonPath, Map, Pass, StateMachine, Wait, WaitTime } from "aws-cdk-lib/aws-stepfunctions";
import { CallAwsService } from "aws-cdk-lib/aws-stepfunctions-tasks";
import { NagSuppressions } from "cdk-nag";
import { Construct } from "constructs";
const util = require("util");

export interface ProducerApprovalWorkflowProps {
    centralAccountId: string
}

export class ProducerApprovalWorkflow extends Construct {

    constructor(scope: Construct, id: string, props: ProducerApprovalWorkflowProps) {
        super(scope, id);

        const topicKey = new Key(this, "DataLakeSharingApprovalTopicKey", {enableKeyRotation: true});

        const snsTopic = new Topic(this, "DataLakeSharingApproval", {
            topicName: "DataLakeSharingApproval",
            masterKey: topicKey
        });

        NagSuppressions.addResourceSuppressions(snsTopic, [
            {
                id: "AwsSolutions-SNS3",
                reason: "Not applicable"
            }
        ])

        //deprecated, use cross account eventbridge to send the notification

        // const producerWorkflowRolePolicy = new PolicyDocument({
        //     statements: [
        //         new PolicyStatement({
        //             sid: "AccessApprovalPermission",
        //             effect: Effect.ALLOW,
        //             actions: [
        //                 "sns:Publish"
        //             ],
        //             resources: [snsTopic.topicArn]
        //         }),
        //         new PolicyStatement({
        //             sid: "DataProductManagementPolicy",
        //             effect: Effect.ALLOW,
        //             actions: [
        //                 "s3:*BucketPolicy"
        //             ],
        //             resources: ["*"]
        //         }),
        //         new PolicyStatement({
        //             sid: "DataQualityAccessPolicy",
        //             effect: Effect.ALLOW,
        //             actions: [
        //                 "s3:Get*",
        //                 "s3:List*"
        //             ],
        //             resources: ["*"]
        //         })
        //     ]
        // });
    
        // const producerWorkflowRole = new Role(this, "ProducerWorkflowRole", {
        //     assumedBy: new AccountPrincipal(props.centralAccountId),
        //     inlinePolicies: {
        //         "inline0": producerWorkflowRolePolicy
        //     },
        //     roleName: "ProducerWorkflowRole"
        // });

        //event bridge for SNS notifications for approval
        const approvalEventBus = new EventBus(this, "WorkflowApprovalEventBus", {
            eventBusName: util.format("%s_%s", Stack.of(this).account, "sharingApprovalBus")
        });

        new CfnEventBusPolicy(this, "ApprovalEventBusAllowCentralAccess", {
            statementId: util.format("%s_centralAccessPolicy", props.centralAccountId),
            action: "events:PutEvents",
            eventBusName: approvalEventBus.eventBusName,
            principal: props.centralAccountId
        })
        

        const sendApprovalNotificationLambdaRole = new Role(this, "SendApprovalNotificationLambdaRole", {
            assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
            managedPolicies: [ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole")],
            inlinePolicies: {
                "AllowSNSPublish": new PolicyDocument({
                    statements: [
                        new PolicyStatement({
                            effect: Effect.ALLOW,
                            actions: ["sns:Publish"],
                            resources: [snsTopic.topicArn]
                        }),
                        new PolicyStatement({
                            effect: Effect.ALLOW,
                            actions: ["kms:GenerateDataKey", "kms:Decrypt"],
                            resources: [topicKey.keyArn]
                        })
                    ]
                })
            }
        });

        const sendApprovalLambda = new Function(this, "SendApprovalFunction", {
            handler: "index.handler",
            runtime: Runtime.NODEJS_16_X,
            code: Code.fromAsset(__dirname+"/resources/lambda/SendApprovalNotification"),
            role: sendApprovalNotificationLambdaRole,
            environment: {
                "TOPIC_ARN": snsTopic.topicArn
            }
        })

        new Rule(this, "TriggerSendApproval", {
            eventBus: approvalEventBus,
            eventPattern: {
                source: ["com.central.sharing-approval"]
            },
            targets: [
                new LambdaFunction(sendApprovalLambda, {
                    event: RuleTargetInput.fromEventPath("$.detail")
                })
            ]
        })
    }
}