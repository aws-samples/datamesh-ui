import { CfnOutput, Stack } from "aws-cdk-lib";
import { CloudFrontWebDistribution, HttpVersion, OriginAccessIdentity, ViewerProtocolPolicy } from "aws-cdk-lib/aws-cloudfront";
import { BlockPublicAccess, Bucket, BucketEncryption } from "aws-cdk-lib/aws-s3";
import { NagSuppressions } from "cdk-nag";
import { Construct } from "constructs";

export class DataMeshUIHosting extends Construct {
    constructor(scope: Construct, id: string) {
        super(scope, id)

        const accountId = Stack.of(this).account
        const region = Stack.of(this).region
        const bucketName = `datamesh-ui-hosting-${accountId}-${region}`

        const bucket = new Bucket(this, "HostingBucket", {
            bucketName: bucketName,
            blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
            encryption: BucketEncryption.S3_MANAGED,
            enforceSSL: true
        })

        NagSuppressions.addResourceSuppressions(bucket, [
            {
                id: "AwsSolutions-S1",
                reason: "Not required"
            }
        ])


        const oai = new OriginAccessIdentity(this, "HostingOAI")
        const distribution = new CloudFrontWebDistribution(this, "HostingCFDistribution", {
            originConfigs: [
                {
                    s3OriginSource: {
                        s3BucketSource: bucket,
                        originAccessIdentity: oai
                    },
                    behaviors: [{
                        isDefaultBehavior: true
                    }]
                }
            ],
            errorConfigurations: [
                {
                    errorCode: 404,
                    responseCode: 200,
                    responsePagePath: "/index.html"
                },
                {
                    errorCode: 403,
                    responseCode: 200,
                    responsePagePath: "/index.html"
                }
            ],
            defaultRootObject: "index.html",
            viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS
        })

        NagSuppressions.addResourceSuppressions(distribution, [
            {
                id: "AwsSolutions-CFR4",
                reason: "Not required"
            },
            {
                id: "AwsSolutions-CFR3",
                reason: "Not required"
            }
        ])

        new CfnOutput(this, "HostingBucketArn", {
            value: bucket.bucketArn
        })

        new CfnOutput(this, "HostingBucketName", {
            value: bucket.bucketName
        })

        new CfnOutput(this, "HostingCFDomain", {
            value: distribution.distributionDomainName
        })
    }
}