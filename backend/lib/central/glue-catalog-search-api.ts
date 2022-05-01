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

export interface GlueCatalogSearchApiProps {
    accountId: string;
    opensearchDataNodeInstanceSize?: string;
    userPool: UserPool;
}

export class GlueCatalogSearchApi extends Construct {
    readonly osEndpoint: string;
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

        const vpc = new Vpc(this, "SearchVpc", {
            cidr: "10.37.0.0/16",
            maxAzs: 3,
        });

        const privateSubnetSelection = [{ subnets: vpc.privateSubnets }];
        const privateSubnets = vpc.selectSubnets({
            subnetType: SubnetType.PRIVATE_WITH_NAT,
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

        const indexDeltaLambda = new NodejsFunction(this, "IndexDeltaLambda", {
            entry:
                __dirname +
                "/resources/lambda/GlueCatalogSearch/IndexDelta/index.ts",
            vpc,
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
            vpc,
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
                vpc,
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
            vpc,
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
        const indexDeltaLFSettings = new CfnDataLakeSettings(
            this,
            "indexDeltaLFAdmin",
            {
                admins: [
                    {
                        dataLakePrincipalIdentifier:
                            indexDeltaLambdaRole.roleArn,
                    },
                ],
            }
        );
        indexDeltaLFSettings.node.addDependency(indexDeltaLambdaRole);

        const indexAllLFSettings = new CfnDataLakeSettings(
            this,
            "indexAllLFAdmin",
            {
                admins: [
                    {
                        dataLakePrincipalIdentifier: indexAllLambdaRole.roleArn,
                    },
                ],
            }
        );
        indexAllLFSettings.node.addDependency(indexAllLambdaRole);

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
            indexAllLambda,
            indexAllLFSettings
        );
    }
}
