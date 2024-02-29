import { Construct } from "constructs";
import {
    aws_apigateway,
    CfnOutput,
    custom_resources,
    Duration,
    RemovalPolicy,
} from "aws-cdk-lib";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import { Port, SecurityGroup, SubnetType, Vpc } from "aws-cdk-lib/aws-ec2";
import { CfnDataLakeSettings } from "aws-cdk-lib/aws-lakeformation";
import {
    CfnServiceLinkedRole,
    Effect,
    PolicyStatement,
    Role,
    ServicePrincipal,
    ManagedPolicy,
    PolicyDocument,
    IRole,
} from "aws-cdk-lib/aws-iam";
import { Domain, EngineVersion } from "aws-cdk-lib/aws-opensearchservice";
import { Rule } from "aws-cdk-lib/aws-events";
import { LambdaFunction } from "aws-cdk-lib/aws-events-targets";
import {
    CfnMethod,
    CognitoUserPoolsAuthorizer,
    LambdaIntegration,
    LambdaRestApi,
} from "aws-cdk-lib/aws-apigateway";
import { UserPool } from "aws-cdk-lib/aws-cognito";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { NagSuppressions } from "cdk-nag";
import { Runtime } from "aws-cdk-lib/aws-lambda";

interface GlueCatalogSearchApiWithCommonProps {
    accountId: string;
    opensearchDataNodeInstanceSize?: string;
    userPool: UserPool;
}

interface GlueCatalogSearchApiWithVpcProps
    extends GlueCatalogSearchApiWithCommonProps {
    /*
    Optional: VPC for the OpenSearch cluster. Requires at least one private subnet. 
    The OpenSearch cluster will be created with a data node per private subnet.
    Alternatively, use vpcCidrRange parameter if you want to setup a separate VPC for the OpenSearch cluster.
    */
    vpc: Vpc;
}

interface GlueCatalogSearchApiWithVpcCidrRangeProps
    extends GlueCatalogSearchApiWithCommonProps {
    /*
    Optional: VPC CIDR range for the OpenSearch cluster. Will led to the creation of a VPC with 3 private subnets, one per AZ.
    Each private subnet will host one data node of the OpenSearch cluster.
    Parameter will be ignored if "vpc" is already set.
    */
    vpcCidrRange: string;
}

export type GlueCatalogSearchApiProps =
    | GlueCatalogSearchApiWithVpcProps
    | GlueCatalogSearchApiWithVpcCidrRangeProps;

function isVpcProps(
    properties:
        | GlueCatalogSearchApiWithVpcProps
        | GlueCatalogSearchApiWithVpcCidrRangeProps
): properties is GlueCatalogSearchApiWithVpcProps {
    return (properties as GlueCatalogSearchApiWithVpcProps).vpc !== undefined;
}

export class GlueCatalogSearchApi extends Construct {
    readonly osEndpoint: string;
    readonly indexAllLambdaRole: IRole
    readonly indexDeltaLambdaRole: IRole

    constructor(
        scope: Construct,
        id: string,
        props: GlueCatalogSearchApiProps
    ) {
        super(scope, id);

        const {
            accountId,
            opensearchDataNodeInstanceSize = "t3.small.search",
        } = props;

        const vpc = isVpcProps(props)
            ? props.vpc
            : new Vpc(this, "SearchVpc", {
                  cidr: props.vpcCidrRange,
                  maxAzs: 3,
              });

        NagSuppressions.addResourceSuppressions(vpc, [
            {
                id: "AwsSolutions-VPC7",
                reason: "Not needed",
            },
        ]);

        const privateSubnetSelection = [{ subnets: vpc.privateSubnets }];
        const privateSubnets = vpc.selectSubnets({
            subnetType: SubnetType.PRIVATE_WITH_EGRESS,
        });

        const opensearchServiceLinkedRole = new CfnServiceLinkedRole(
            this,
            "OpensearchSLR",
            {
                awsServiceName: "es.amazonaws.com",
            }
        );

        const opensearchDomainSecurityGroup = new SecurityGroup(
            this,
            "OpensearchDomainSecurityGroup",
            {
                vpc,
                allowAllOutbound: true,
                description:
                    "Allow communication between OpenSearch and the ingestion Lambda",
            }
        );

        const opensearchDomain = new Domain(this, "CatalogDomain", {
            removalPolicy: RemovalPolicy.DESTROY,
            version: EngineVersion.OPENSEARCH_1_1,
            enableVersionUpgrade: true,
            enforceHttps: true,
            encryptionAtRest: {
                enabled: true,
            },
            nodeToNodeEncryption: true,
            capacity: {
                dataNodes: vpc.availabilityZones.length,
                dataNodeInstanceType: opensearchDataNodeInstanceSize,
            },
            vpc,
            vpcSubnets: privateSubnetSelection,
            logging: {
                appLogEnabled: true,
                slowIndexLogEnabled: true,
                slowSearchLogEnabled: true,
            },
            securityGroups: [opensearchDomainSecurityGroup],
            zoneAwareness: {
                enabled: true,
                availabilityZoneCount: vpc.availabilityZones.length,
            },
        });

        NagSuppressions.addResourceSuppressions(
            opensearchDomain,
            [
                {
                    id: "AwsSolutions-IAM5",
                    reason: "For logging purposes",
                },
                {
                    id: "AwsSolutions-OS3",
                    reason: "Not applicable",
                },
                {
                    id: "AwsSolutions-OS4",
                    reason: "Not applicable",
                },
                {
                    id: "AwsSolutions-OS5",
                    reason: "Not applicable",
                },
            ],
            true
        );

        opensearchDomain.node.addDependency(opensearchServiceLinkedRole);

        const opensearchIndex = "glue_catalog";

        const glueCatalogLambdaRolePolicy = new PolicyDocument({
            statements: [
                new PolicyStatement({
                    effect: Effect.ALLOW,
                    actions: ["lakeformation:GrantPermissions"],
                    resources: ["*"],
                }),
                new PolicyStatement({
                    effect: Effect.ALLOW,
                    actions: [
                        "glue:GetTable",
                        "glue:GetDatabase",
                        "glue:GetDatabases",
                        "glue:GetTables",
                    ],
                    resources: ["*"],
                }),
                new PolicyStatement({
                    effect: Effect.ALLOW,
                    actions: [
                        "es:ESHttpGet",
                        "es:ESHttpHead",
                        "es:ESHttpDelete",
                        "es:ESHttpPost",
                        "es:ESHttpPut",
                        "es:ESHttpPatch",
                    ],
                    resources: ["*"],
                }),
                new PolicyStatement({
                    effect: Effect.ALLOW,
                    actions: [
                        "ec2:CreateNetworkInterface",
                        "ec2:DescribeNetworkInterfaces",
                        "ec2:DeleteNetworkInterface",
                    ],
                    resources: ["*"],
                }),
            ],
        });

        const indexDeltaLambdaRole = new Role(this, "IndexDeltaLambdaRole", {
            assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
            managedPolicies: [
                ManagedPolicy.fromAwsManagedPolicyName(
                    "service-role/AWSLambdaBasicExecutionRole"
                ),
                ManagedPolicy.fromAwsManagedPolicyName(
                    "AWSLakeFormationCrossAccountManager"
                ),
            ],
            inlinePolicies: { inline0: glueCatalogLambdaRolePolicy },
        });

        NagSuppressions.addResourceSuppressions(indexDeltaLambdaRole, [
            {
                id: "AwsSolutions-IAM4",
                reason: "Basic loggic and Lake Formation access",
            },
            {
                id: "AwsSolutions-IAM5",
                reason: "Permissions are handled by Lake Formation",
            },
        ]);

        const indexDeltaLambda = new NodejsFunction(this, "IndexDeltaLambda", {
            entry:
                __dirname +
                "/resources/lambda/GlueCatalogSearch/IndexDelta/index.ts",
            depsLockFilePath: __dirname + "/../../yarn.lock",
            vpc,
            runtime: Runtime.NODEJS_LATEST,
            vpcSubnets: privateSubnets,
            securityGroups: [opensearchDomainSecurityGroup],
            role: indexDeltaLambdaRole,
            logRetention: RetentionDays.ONE_DAY,
            environment: {
                OPENSEARCH_INDEX: opensearchIndex,
            },
        });
        // TODO create a more tight security group setting
        opensearchDomainSecurityGroup.addIngressRule(
            opensearchDomainSecurityGroup,
            Port.allTcp(),
            "Allow inbound communication for the ingest Lambda to OpenSearch communication",
            false
        );
        indexDeltaLambda.addEnvironment(
            "DOMAIN_ENDPOINT",
            opensearchDomain.domainEndpoint
        );

        // TODO split in two rules
        const glueCatalogChangeRule = new Rule(this, "GlueCatalogChangeRule", {
            enabled: true,
            eventPattern: {
                source: ["aws.glue"],
                detailType: [
                    "Glue Data Catalog Database State Change",
                    "Glue Data Catalog Table State Change",
                ],
            },
            targets: [new LambdaFunction(indexDeltaLambda, {})],
        });

        const searchLambda = new NodejsFunction(this, "SearchIndexLambda", {
            entry:
                __dirname +
                "/resources/lambda/GlueCatalogSearch/SearchIndex/index.ts",
            depsLockFilePath: __dirname + "/../../yarn.lock",
            vpc,
            runtime: Runtime.NODEJS_LATEST,
            vpcSubnets: privateSubnets,
            securityGroups: [opensearchDomainSecurityGroup],
            logRetention: RetentionDays.ONE_DAY,
            environment: {
                OPENSEARCH_INDEX: opensearchIndex,
                DOMAIN_ENDPOINT: opensearchDomain.domainEndpoint,
            },
        });

        opensearchDomain.grantIndexReadWrite(opensearchIndex, searchLambda);

        const cognitoAuthorizer = new CognitoUserPoolsAuthorizer(
            this,
            "CognitoUserPoolsAuthorizer",
            {
                cognitoUserPools: [props.userPool],
            }
        );

        const searchApi = new LambdaRestApi(this, "SearchApi", {
            handler: searchLambda,
            proxy: false,
            defaultCorsPreflightOptions: {
                allowOrigins: ["*"],
                allowCredentials: true,
            },
            defaultMethodOptions: {
                authorizationType: aws_apigateway.AuthorizationType.COGNITO,
                authorizer: cognitoAuthorizer,
            },
        });

        searchApi.root
            .addResource("search")
            .addResource("{searchTerm}")
            .addMethod("GET");

        new CfnOutput(this, "searchApi", {
            value: searchApi.url,
        });

        this.osEndpoint = searchApi.url;

        const getByDocumentIdLambda = new NodejsFunction(
            this,
            "GetByDocumentIdLambda",
            {
                entry:
                    __dirname +
                    "/resources/lambda/GlueCatalogSearch/GetByDocumentId/index.ts",
                depsLockFilePath: __dirname + "/../../yarn.lock",
                vpc,
                runtime: Runtime.NODEJS_LATEST,
                vpcSubnets: privateSubnets,
                securityGroups: [opensearchDomainSecurityGroup],

                logRetention: RetentionDays.ONE_DAY,
                environment: {
                    OPENSEARCH_INDEX: opensearchIndex,
                    DOMAIN_ENDPOINT: opensearchDomain.domainEndpoint,
                },
            }
        );
        opensearchDomain.grantIndexRead(opensearchIndex, getByDocumentIdLambda);

        searchApi.root
            .addResource("document")
            .addResource("{documentId}")
            .addMethod("GET", new LambdaIntegration(getByDocumentIdLambda));

        // Remove the default authorizer for OPTIONS requests to ensure that CORS pre-flight works
        searchApi.methods
            .filter((m) => m.httpMethod === "OPTIONS")
            .forEach((m) => {
                (m?.node?.defaultChild as CfnMethod).addPropertyOverride(
                    "AuthorizationType",
                    "NONE"
                );
            });

        new CfnOutput(this, "SearchApiArn", {
            value: searchApi.arnForExecuteApi(),
        });

        const indexAllLambdaRole = new Role(this, "IndexAllLambdaRole", {
            assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
            managedPolicies: [
                ManagedPolicy.fromAwsManagedPolicyName(
                    "service-role/AWSLambdaBasicExecutionRole"
                ),
                ManagedPolicy.fromAwsManagedPolicyName(
                    "AWSLakeFormationCrossAccountManager"
                ),
            ],
            inlinePolicies: { inline0: glueCatalogLambdaRolePolicy },
        });

        const indexAllLambda = new NodejsFunction(this, "IndexAllLambda", {
            entry:
                __dirname +
                "/resources/lambda/GlueCatalogSearch/IndexAll/index.ts",
            depsLockFilePath: __dirname + "/../../yarn.lock",
            vpc,
            runtime: Runtime.NODEJS_LATEST,
            vpcSubnets: privateSubnets,
            securityGroups: [opensearchDomainSecurityGroup],
            logRetention: RetentionDays.ONE_DAY,
            role: indexAllLambdaRole,
            timeout: Duration.seconds(30),
            environment: {
                OPENSEARCH_INDEX: opensearchIndex,
                DOMAIN_ENDPOINT: opensearchDomain.domainEndpoint,
                CatalogId: accountId,
            },
        });

        // Watch for the CDK issue 19492: renaming of IAM roles breaks the LF permissions https://github.com/aws/aws-cdk/issues/19492
        // const indexDeltaLFSettings = new CfnDataLakeSettings(
        //     this,
        //     "indexDeltaLFAdmin",
        //     {
        //         admins: [
        //             {
        //                 dataLakePrincipalIdentifier:
        //                     indexDeltaLambdaRole.roleArn,
        //             },
        //         ],
        //     }
        // );
        // indexDeltaLFSettings.node.addDependency(indexDeltaLambdaRole);
        this.indexDeltaLambdaRole = indexDeltaLambdaRole

        // const indexAllLFSettings = new CfnDataLakeSettings(
        //     this,
        //     "indexAllLFAdmin",
        //     {
        //         admins: [
        //             {
        //                 dataLakePrincipalIdentifier: indexAllLambdaRole.roleArn,
        //             },
        //         ],
        //     }
        // );
        // indexAllLFSettings.node.addDependency(indexAllLambdaRole);

        this.indexAllLambdaRole = indexAllLambdaRole

        const indexAllLambdaTrigger = new custom_resources.AwsCustomResource(
            this,
            "IndexAllLambdaTrigger",
            {
                policy: custom_resources.AwsCustomResourcePolicy.fromStatements(
                    [
                        new PolicyStatement({
                            actions: ["lambda:InvokeFunction"],
                            effect: Effect.ALLOW,
                            resources: [indexAllLambda.functionArn],
                        }),
                    ]
                ),
                timeout: Duration.minutes(15),
                onCreate: {
                    service: "Lambda",
                    action: "invoke",
                    parameters: {
                        FunctionName: indexAllLambda.functionName,
                        InvocationType: "Event",
                    },
                    physicalResourceId: custom_resources.PhysicalResourceId.of(
                        "IndexAllLambdaTriggerPhysicalId" +
                            Date.now().toString()
                    ),
                },
                onUpdate: {
                    service: "Lambda",
                    action: "invoke",
                    parameters: {
                        FunctionName: indexAllLambda.functionName,
                        InvocationType: "Event",
                    },
                    physicalResourceId: custom_resources.PhysicalResourceId.of(
                        "IndexAllLambdaTriggerPhysicalId" +
                            Date.now().toString()
                    ),
                },
            }
        );
        indexAllLambdaTrigger.node.addDependency(
            indexAllLambda
        );

        NagSuppressions.addResourceSuppressions(
            searchLambda,
            [
                {
                    id: "AwsSolutions-IAM4",
                    reason: "Basic logging and VPC access",
                },
                {
                    id: "AwsSolutions-IAM5",
                    reason: "Permissions are managed by Lake Formation",
                },
            ],
            true
        );

        NagSuppressions.addResourceSuppressions(
            searchApi,
            [
                {
                    id: "AwsSolutions-APIG2",
                    reason: "Already handled",
                },
                {
                    id: "AwsSolutions-IAM4",
                    reason: "Logging purposes",
                },
                {
                    id: "AwsSolutions-APIG1",
                    reason: "Not needed",
                },
                {
                    id: "AwsSolutions-APIG6",
                    reason: "Not needed",
                },
                {
                    id: "AwsSolutions-APIG4",
                    reason: "Not needed for preflight"
                },
                {
                    id: "AwsSolutions-COG4",
                    reason: "Not needed for preflight"
                }
            ],
            true
        );

        NagSuppressions.addResourceSuppressions(
            getByDocumentIdLambda,
            [
                {
                    id: "AwsSolutions-IAM4",
                    reason: "Foundational permissions",
                },
                {
                    id: "AwsSolutions-IAM5",
                    reason: "Permissions managed by Lake Formation",
                },
            ],
            true
        );

        NagSuppressions.addResourceSuppressions(
            indexAllLambdaRole,
            [
                {
                    id: "AwsSolutions-IAM4",
                    reason: "Foundational permissions",
                },
                {
                    id: "AwsSolutions-IAM5",
                    reason: "Permissions managed by Lake Formation",
                },
            ],
            true
        );
    }
}
