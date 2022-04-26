import { IdentityPool, UserPoolAuthenticationProvider } from "@aws-cdk/aws-cognito-identitypool-alpha";
import { UserPool, UserPoolClient } from "aws-cdk-lib/aws-cognito";
import { Effect, IRole, ManagedPolicy, Policy, PolicyDocument, PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import {App, CodeCommitSourceCodeProvider, CustomRule, GitHubSourceCodeProvider, RedirectStatus} from "@aws-cdk/aws-amplify-alpha";
import { CfnOutput, SecretValue, Stack } from "aws-cdk-lib";
import { BuildSpec } from "aws-cdk-lib/aws-codebuild";
import { Code, Repository } from "aws-cdk-lib/aws-codecommit";
import { CallAwsService } from "aws-cdk-lib/aws-stepfunctions-tasks";
import { JsonPath, Map, Pass, StateMachine, StateMachineType } from "aws-cdk-lib/aws-stepfunctions";
import { EventField, Rule, RuleTargetInput } from "aws-cdk-lib/aws-events";
import { SfnStateMachine } from "aws-cdk-lib/aws-events-targets";
import { AttributeType, BillingMode, Table } from "aws-cdk-lib/aws-dynamodb";
const util = require("util");

export interface DataMeshUIProps {
    stateMachineArn: string,
    stateMachineName: string,
    dpmStateMachineArn?: string,
    dpmStateMachineRoleArn?: string,
    searchApiUrl: string,
    dataQualityHttpApiUrl: string
}

export class DataMeshUI extends Construct {

    readonly authRole: IRole;

    constructor(scope: Construct, id: string, props: DataMeshUIProps) {
        super(scope, id)

        const userPool = new UserPool(this, "DataMeshUICognitoUserPool", {
            standardAttributes: {
                email: {
                    required: true
                }
            }
        });

        let uiPayload : any = {
            "InfraStack": {
                "StateMachineArn": props.stateMachineArn,
                "DataQualityHttpApiUrl": props.dataQualityHttpApiUrl,
                "SearchApiUrl": props.searchApiUrl
            }
        }

        const client = new UserPoolClient(this, "DataMeshUICognitoUserPoolWebClient", {
            userPool: userPool,
            userPoolClientName: "WebClient"
        });

        const identityProvider = new IdentityPool(this, "DataMeshUICognitoIdentityPool", {
            allowUnauthenticatedIdentities: false
        });      

        identityProvider.addUserPoolAuthentication(new UserPoolAuthenticationProvider({userPool, userPoolClient: client}));

        const stateMachineArn = props.stateMachineArn;
        identityProvider.authenticatedRole.attachInlinePolicy(new Policy(this, "DataMeshUIAuthRoleInlinePolicy", {
            statements: [   
                new PolicyStatement({
                    effect: Effect.ALLOW,
                    actions: [
                        "glue:GetDatabase",
                        "glue:GetTables",
                        "glue:GetDatabases",
                        "glue:GetTable"
                    ],
                    resources: ["*"]
                }),
                new PolicyStatement({
                    effect: Effect.ALLOW,
                    actions: [
                        "states:ListExecutions",
                        "states:StartExecution"   
                    ],
                    resources: [props.stateMachineArn]
                }),
                new PolicyStatement({
                    effect: Effect.ALLOW,
                    actions: [
                        "states:DescribeExecution"
                    ],
                    resources: [util.format("arn:aws:states:%s:%s:execution:%s:*", Stack.of(this).region, Stack.of(this).account, props.stateMachineName)]
                })
            ]
        }));

        this.authRole = identityProvider.authenticatedRole;

        // const repo = new Repository(this, "DataMeshUIRepository", {
        //     repositoryName: "datamesh-ui",
        //     code: Code.fromZipFile(props.dataMeshUICodeZip, "main")
        // })

        // const amplifyServiceRole = new Role(this, "DataMeshUIAmplifyServiceRole", {
        //     assumedBy: new ServicePrincipal("amplify.amazonaws.com"),
        //     managedPolicies: [
        //         ManagedPolicy.fromAwsManagedPolicyName("AdministratorAccess-Amplify")
        //     ]
        // })



        if (props.dpmStateMachineArn && props.dpmStateMachineRoleArn) {
            const grantUIAuthRolePermissions = new CallAwsService(this, "DPMGrantUIAuthRolePermissions", {
                service: "lakeformation",
                action: "grantPermissions",
                iamResources: ["*"],
                parameters: {
                    "Permissions": [
                        "DESCRIBE"
                    ],
                    "Principal": {
                        "DataLakePrincipalIdentifier": identityProvider.authenticatedRole.roleArn
                    },
                    "Resource": {
                        "Table": {
                          "DatabaseName.$": "States.Format('{}_{}', $.producer_acc_id, $.database_name)",
                          "TableWildcard": {}
                        }
                    }
                },
                resultPath: JsonPath.DISCARD,
                inputPath: "$.payload"
            });

            const initialState = new Pass(this, "InitialState", {
                inputPath: "$.detail.input",
                parameters: {
                    "payload.$": "States.StringToJson($)"
                }
            })

            grantUIAuthRolePermissions.endStates

            initialState.next(grantUIAuthRolePermissions);

            const dataMeshUINewProductAuthFlow = new StateMachine(this, "DataMeshUINewProductAuthFlow", {
                definition: initialState,
                role: Role.fromRoleArn(this, "DPMStateMachineRole", props.dpmStateMachineRoleArn),
                stateMachineType: StateMachineType.STANDARD
            });

            const dpmAddProdEventBridgeRule = new Rule(this, 'DPMAddProdDataMeshUIRule', {
                eventPattern: {
                    source: ["aws.states"],
                    detailType: ["Step Functions Execution Status Change"],
                    detail: {
                        "status": ["SUCCEEDED"],
                        "stateMachineArn": [props.dpmStateMachineArn]
                    }
                }
            });

            dpmAddProdEventBridgeRule.addTarget(new SfnStateMachine(dataMeshUINewProductAuthFlow))

            const registerProductTable = new Table(this, "DPMRegisterProductTable", {
                partitionKey: {
                    name: "accountId",
                    type: AttributeType.STRING
                },
                sortKey: {
                    name: "dbTableName",
                    type: AttributeType.STRING
                },
                billingMode: BillingMode.PAY_PER_REQUEST
            });

            const gsiStatusIndexName = "DPMRegisterProductTable-StatusIndex";

            registerProductTable.addGlobalSecondaryIndex({
                indexName: gsiStatusIndexName,
                partitionKey: {
                    name: "status",
                    type: AttributeType.STRING
                },
                sortKey: {
                    name: "createdAt",
                    type: AttributeType.NUMBER
                }
            })

            uiPayload.InfraStack.RegisterProductTable = {
                "Name": registerProductTable.tableName,
                "Arn": registerProductTable.tableArn,
                "GSI-StatusIndex": gsiStatusIndexName
            }

            uiPayload.InfraStack.DPMStateMachineArn = props.dpmStateMachineArn;

            const registerProductInitialState = new Pass(this, "RegisterProductInitialState", {
                parameters: {
                    "payload.$": "States.StringToJson($.detail.input)",
                    "status.$": "$.detail.status",
                    "createdAt.$": "$.detail.startDate"
                }
            });

            const mapTables = new Map(this, "TraverseTableArray", {
                itemsPath: "$.payload.tables",
                maxConcurrency: 2,
                parameters: {
                    "producerAccountId.$": "$.payload.producer_acc_id",
                    "status.$": "$.status",
                    "createdAt.$": "$.createdAt",
                    "table.$": "$$.Map.Item.Value"
                }
            });

            const putRegisterProductData = new CallAwsService(this, "PutRegisterProductData", {
                service: "dynamodb",
                action: "putItem",
                iamResources: [registerProductTable.tableArn],
                resultPath: JsonPath.DISCARD,
                parameters: {
                    "TableName": registerProductTable.tableName,
                    "Item": {
                        "accountId": {
                            "S.$": "$.producerAccountId" 
                        },
                        "dbTableName": {
                            "S.$": "States.Format('{}#{}', $.producerAccountId, $.table.name)"
                        },
                        "location": {
                            "S.$": "$.table.location"
                        },
                        "status": {
                            "S.$": "$.status"
                        },
                        "createdAt": {
                            "N.$": "States.Format('{}', $.createdAt)"
                        }
                    }
                }
            })

            putRegisterProductData.endStates;
            mapTables.iterator(putRegisterProductData).endStates;
            registerProductInitialState.next(mapTables)

            const registerProductSM = new StateMachine(this, "RegisterProductMetadata", {
                definition: registerProductInitialState,
                stateMachineType: StateMachineType.STANDARD
            });

            const registerProductUIRule = new Rule(this, 'RegisterProductUIRule', {
                eventPattern: {
                    source: ["aws.states"],
                    detailType: ["Step Functions Execution Status Change"],
                    detail: {
                        "stateMachineArn": [props.dpmStateMachineArn]
                    }
                }
            });

            registerProductUIRule.addTarget(new SfnStateMachine(registerProductSM));

            identityProvider.authenticatedRole.attachInlinePolicy(new Policy(this, "UIDPMStateMachinePolicy", {
                statements: [   
                    new PolicyStatement({
                        effect: Effect.ALLOW,
                        actions: [
                            "states:ListExecutions",
                            "states:StartExecution"   
                        ],
                        resources: [props.dpmStateMachineArn]
                    }),
                    new PolicyStatement({
                        effect: Effect.ALLOW,
                        actions: [
                            "states:DescribeExecution"
                        ],
                        resources: [util.format("arn:aws:states:%s:%s:execution:%s:*", Stack.of(this).region, Stack.of(this).account, props.dpmStateMachineArn.substring(props.dpmStateMachineArn.lastIndexOf(":")+1))]
                    }),
                    new PolicyStatement({
                        effect: Effect.ALLOW,
                        actions: [
                            "dynamodb:Query",
                            "dynamodb:Scan",
                            "dynamodb:GetItem"
                        ],
                        resources: [
                            registerProductTable.tableArn,
                            registerProductTable.tableArn+"/index/*"
                        ]
                    })
                ]
            }));
        }

        new CfnOutput(this, "CognitoAuthRoleArn", {
            value: identityProvider.authenticatedRole.roleArn
        });

        new CfnOutput(this, "UserPoolId", {
            value: userPool.userPoolId
        });

        new CfnOutput(this, "ClientId", {
            value: client.userPoolClientId
        });

        new CfnOutput(this, "IdentityPoolId", {
            value: identityProvider.identityPoolId
        })

        new CfnOutput(this, "UIPayload", {
            value: JSON.stringify(uiPayload)
        })

        // const amplifyApp = new App(this, "DataMeshUI", {
        //     sourceCodeProvider: new CodeCommitSourceCodeProvider({
        //         repository: repo
        //     }),
        //     role: amplifyServiceRole,
        //     buildSpec: BuildSpec.fromObjectToYaml({
        //         version: '1.0',
        //         frontend: {
        //             phases: {
        //                 preBuild: {
        //                     commands: [
        //                         "npm install",
        //                         "amplify init -y",
        //                         util.format("echo '{\"version\": 1, \"userPoolId\": \"%s\", \"webClientId\": \"%s\", \"nativeClientId\": \"%s\", \"identityPoolId\": \"%s\"}' | amplify import auth --headless", 
        //                             userPool.userPoolId,
        //                             client.userPoolClientId,
        //                             client.userPoolClientId,
        //                             identityProvider.identityPoolId),
        //                         "amplify push -y",
        //                         util.format("echo '%s' > src/cfn-output.json", JSON.stringify(uiPayload))
        //                     ]
        //                 },
        //                 build: {
        //                     commands: [
        //                         "npm run build"
        //                     ]
        //                 }
        //             },
        //             artifacts: {
        //                 baseDirectory: "build",
        //                 files: ["**/*"]
                        
        //             }
        //         }
        //     }),
        //     customRules: [
        //         new CustomRule({
        //             source: "</^[^.]+$|\\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|woff2|ttf|map|json)$)([^.]+$)/>",
        //             target: "/index.html",
        //             status: RedirectStatus.REWRITE
        //         })
        //     ]
        // });

        // amplifyApp.addBranch("RebasedSearchComponent");
    }
}
