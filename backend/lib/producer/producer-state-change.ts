import { Duration } from "aws-cdk-lib";
import { EventBus, Rule } from "aws-cdk-lib/aws-events";
import { LambdaFunction } from "aws-cdk-lib/aws-events-targets";
import { Effect, ManagedPolicy, PolicyDocument, PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { Code, Function, Runtime } from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";

const DATA_DOMAIN_BUS_NAME = "data-mesh-bus"

export interface ProducerStateChangeProps {
    centralEventBusArn: string
}

export class ProducerStateChange extends Construct {
    constructor(scope: Construct, id: string, props: ProducerStateChangeProps) {
        super(scope, id)

        const parseCrawlerStateChangeRole = new Role(this, "ParseCrawlerStateChangeRole", {
            assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
            managedPolicies: [ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole")],
            inlinePolicies: {inline0: new PolicyDocument({
                statements: [
                    new PolicyStatement({
                        effect: Effect.ALLOW,
                        actions: [
                            "events:PutEvents"
                        ],
                        resources: [props.centralEventBusArn]
                    })
                ]
            })}
        });

        const parseCrawlerStateChangeFunction = new Function(this, "ParseCrawlerStateChangeFunction", {
            runtime: Runtime.NODEJS_LATEST,
            role: parseCrawlerStateChangeRole,
            handler: "index.handler",
            timeout: Duration.seconds(30),
            code: Code.fromAsset(__dirname+"/resources/lambda/ParseCrawlerStateChange"),
            environment: {
                CENTRAL_EVENT_BUS_ARN: props.centralEventBusArn
            }
        })

        const dataDomainEventBus = EventBus.fromEventBusName(this, "dataDomainEventBus", DATA_DOMAIN_BUS_NAME)

        parseCrawlerStateChangeFunction.addPermission("dataDomainEventBusPermission", {
            principal: new ServicePrincipal("events.amazonaws.com"),
            sourceArn: dataDomainEventBus.eventBusArn,
            action: "lambda:InvokeFunction"
        })

        new Rule(this, "GlueStateChangeEbRule", {
            eventPattern: {
                source: ["aws.glue"],
                detailType: ["Glue Crawler State Change"]
            },
            targets: [
                new LambdaFunction(parseCrawlerStateChangeFunction)
            ]
        })
    }

}