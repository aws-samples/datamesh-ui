import { CorsHttpMethod, HttpApi } from "@aws-cdk/aws-apigatewayv2-alpha";
import { HttpUserPoolAuthorizer } from "@aws-cdk/aws-apigatewayv2-authorizers-alpha";
import { Duration } from "aws-cdk-lib";
import { NagSuppressions } from "cdk-nag";
import { Construct } from "constructs";

export interface DataMeshUIAPIProps {
    httpiApiUserPoolAuthorizer: HttpUserPoolAuthorizer
}

export class DataMeshUIAPI extends Construct {
    readonly httpApi: HttpApi

    constructor(scope: Construct, id: string, props: DataMeshUIAPIProps) {
        super(scope, id)

        this.httpApi = new HttpApi(this, "DataMeshUIBackendAPI", {
            corsPreflight: {
                allowOrigins: ["*"],
                allowHeaders: ["Authorization", "Content-Type"],
                allowMethods: [
                    CorsHttpMethod.ANY
                ],
                maxAge: Duration.days(1)
            },
            defaultAuthorizer: props.httpiApiUserPoolAuthorizer
        });

        NagSuppressions.addResourceSuppressions(this.httpApi, [
            {
                id: "AwsSolutions-APIG1",
                reason: "API is only used for access approvals."
            },
            {
                id: "AwsSolutions-APIG4",
                reason: "Endpoint requires a task token before proceeding."
            }
        ], true)
    }
}