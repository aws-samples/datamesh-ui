import { IdentityPool } from "@aws-cdk/aws-cognito-identitypool-alpha";
import { UserPool } from "aws-cdk-lib/aws-cognito";
import { Effect, ManagedPolicy, Policy, PolicyDocument, PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import { CfnOutput, Duration, RemovalPolicy, SecretValue, Stack } from "aws-cdk-lib";
import { CallAwsService } from "aws-cdk-lib/aws-stepfunctions-tasks";
import { JsonPath, Map, Pass, StateMachine, StateMachineType } from "aws-cdk-lib/aws-stepfunctions";
import { EventBus, HttpMethod, Rule } from "aws-cdk-lib/aws-events";
import { LambdaFunction, SfnStateMachine } from "aws-cdk-lib/aws-events-targets";
import { AttributeType, BillingMode, ProjectionType, Table, TableEncryption } from "aws-cdk-lib/aws-dynamodb";
import { HttpApi } from "@aws-cdk/aws-apigatewayv2-alpha";
import { HttpUserPoolAuthorizer } from "@aws-cdk/aws-apigatewayv2-authorizers-alpha";
import { Code, Function, Runtime } from "aws-cdk-lib/aws-lambda";
import { HttpLambdaIntegration } from "@aws-cdk/aws-apigatewayv2-integrations-alpha";
import { Secret } from "aws-cdk-lib/aws-secretsmanager";
import { NagSuppressions } from "cdk-nag";
const util = require("util");
const crypto = require("crypto")

export interface DataMeshUIProps {
    stateMachineArn: string
    stateMachineName: string
    searchApiUrl: string
    userPool: UserPool
    identityPool: IdentityPool
    tbacSharingWorkflow: StateMachine
    workflowApiUrl: string
    dpmStateMachineArn?: string
    dpmStateMachineRoleArn?: string
    httpApi: HttpApi
    httpiApiUserPoolAuthorizer: HttpUserPoolAuthorizer
    centralEventBusArn: string
    centralEventHash: string
}

export class DataMeshUI extends Construct {
    readonly userDomainMappingTable: Table

    constructor(scope: Construct, id: string, props: DataMeshUIProps) {
        super(scope, id)
        
        const eventSecret = new Secret(this, "EventSecret", {
            secretObjectValue: {
                "eventHash": SecretValue.unsafePlainText(props.centralEventHash)
            }
        })

        NagSuppressions.addResourceSuppressions(eventSecret, [
            {
                id: "AwsSolutions-SMG4",
                reason: "Used to share Event Hash during Workshop Event"
            }
        ])

        let uiPayload : any = {
            "InfraStack": {
                "AccountId": Stack.of(this).account,
                "StateMachineArn": props.stateMachineArn,
                "SearchApiUrl": props.searchApiUrl,
                "TbacStateMachineArn": props.tbacSharingWorkflow.stateMachineArn,
                "WorkflowApiUrl": props.workflowApiUrl,
                "RegistrationToken": crypto.randomBytes(4).toString('hex')
            }
        }

        this.userDomainMappingTable = new Table(this, "UserDomainMapping", {
            partitionKey: {
                name: "userId",
                type: AttributeType.STRING
            },
            sortKey: {
                name: "accountId",
                type: AttributeType.STRING
            },
            billingMode: BillingMode.PAY_PER_REQUEST,
            encryption: TableEncryption.AWS_MANAGED,
            removalPolicy: RemovalPolicy.DESTROY
        });



        const stateMachineArn = props.stateMachineArn;
        props.identityPool.authenticatedRole.attachInlinePolicy(new Policy(this, "DataMeshUIAuthRoleInlinePolicy", {
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
                        "states:ListExecutions"
                    ],
                    resources: [props.stateMachineArn]
                }),
                new PolicyStatement({
                    effect: Effect.ALLOW,
                    actions: [
                        "states:DescribeExecution"
                    ],
                    resources: [util.format("arn:aws:states:%s:%s:execution:%s:*", Stack.of(this).region, Stack.of(this).account, props.stateMachineName)]
                }),
                new PolicyStatement({
                    effect: Effect.ALLOW,
                    actions: [
                        "lakeformation:GetResourceLFTags"
                    ],
                    resources: ["*"]
                }),
                new PolicyStatement({
                    effect: Effect.ALLOW,
                    actions: [
                        "dynamodb:GetItem"
                    ],
                    resources: [this.userDomainMappingTable.tableArn]
                })
            ]
        }));

        eventSecret.grantRead(props.identityPool.authenticatedRole)

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

        const validateProductPathRole = new Role(this, "ValidateProductPathRole", {
            assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
            managedPolicies: [ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole")],
            inlinePolicies: {inline0: new PolicyDocument({
                statements: [
                    new PolicyStatement({
                        effect: Effect.ALLOW,
                        actions: [
                            "s3:ListBucket"
                        ],
                        resources: ["*"]
                    })
                ]
            })}
        });

        const validateProductPathFunction = new Function(this, "ValidateProductPathFunction", {
            runtime: Runtime.NODEJS_16_X,
            role: validateProductPathRole,
            handler: "index.handler",
            timeout: Duration.seconds(30),
            code: Code.fromAsset(__dirname+"/resources/lambda/ValidateProductPath")
        })

        props.httpApi.addRoutes({
            path: "/data-products/validate",
            methods: [HttpMethod.POST],
            integration: new HttpLambdaIntegration("ValidateProductPathIntegration", validateProductPathFunction),
            authorizer: props.httpiApiUserPoolAuthorizer
        })


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
                        "DataLakePrincipalIdentifier": props.identityPool.authenticatedRole.roleArn
                    },
                    "Resource": {
                        "Table": {
                          "DatabaseName.$": "$.database_name",
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
            const centralEventBus = EventBus.fromEventBusArn(this, "CentralEventBus", props.centralEventBusArn)

            const dataProductRegistrationTable = new Table(this, "DataProductRegistrationTable", {
                partitionKey: {
                    name: "dbName",
                    type: AttributeType.STRING
                },
                sortKey: {
                    name: "tableName",
                    type: AttributeType.STRING
                },
                billingMode: BillingMode.PAY_PER_REQUEST,
                encryption: TableEncryption.AWS_MANAGED,
                removalPolicy: RemovalPolicy.DESTROY
            });

            const updateDataDomainStateChangeRole = new Role(this, "UpdateDataDomainStateChangeRole", {
                assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
                managedPolicies: [ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole")],
                inlinePolicies: {inline0: new PolicyDocument({
                    statements: [
                        new PolicyStatement({
                            effect: Effect.ALLOW,
                            actions: [
                                "dynamodb:PutItem"
                            ],
                            resources: [dataProductRegistrationTable.tableArn]
                        })
                    ]
                })}
            });
    
            const updateDataDomainStateChangeFunction = new Function(this, "UpdateDataDomainStateChangeFunction", {
                runtime: Runtime.NODEJS_16_X,
                role: updateDataDomainStateChangeRole,
                handler: "index.handler",
                timeout: Duration.seconds(30),
                code: Code.fromAsset(__dirname+"/resources/lambda/UpdateDataDomainStateChange"),
                environment: {
                    DDB_TABLE_NAME: dataProductRegistrationTable.tableName
                }
            })            

            updateDataDomainStateChangeFunction.addPermission("invokeFromDataDomainStateChangeEvent", {
                principal: new ServicePrincipal("events.amazonaws.com"),
                sourceArn: props.centralEventBusArn,
                action: "lambda:InvokeFunction"
            })

            new Rule(this, "DataDomainGlueStateChangeTracker", {
                eventBus: centralEventBus,
                eventPattern: {
                    source: ["data-domain-state-change"],
                    detailType: ["data-domain-crawler-update"]
                },
                targets: [
                    new LambdaFunction(updateDataDomainStateChangeFunction)
                ]
            })

            const getCrawlerStateRole = new Role(this, "GetCrawlerStateRole", {
                assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
                managedPolicies: [ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole")],
                inlinePolicies: {inline0: new PolicyDocument({
                    statements: [
                        new PolicyStatement({
                            effect: Effect.ALLOW,
                            actions: [
                                "dynamodb:GetItem"
                            ],
                            resources: [dataProductRegistrationTable.tableArn]
                        })
                    ]
                })}
            });
    
            const getCrawlerStateFunction = new Function(this, "GetCrawlerStateFunction", {
                runtime: Runtime.NODEJS_16_X,
                role: getCrawlerStateRole,
                handler: "index.handler",
                timeout: Duration.seconds(30),
                code: Code.fromAsset(__dirname+"/resources/lambda/GetCrawlerState"),
                environment: {
                    DDB_TABLE_NAME: dataProductRegistrationTable.tableName
                }
            }) 

            props.httpApi.addRoutes({
                path: "/data-products/latest-state",
                methods: [HttpMethod.GET],
                integration: new HttpLambdaIntegration("getCrawlerStateIntegration", getCrawlerStateFunction),
                authorizer: props.httpiApiUserPoolAuthorizer
            })

            const getEventSecretRole = new Role(this, "GetEventSecretRole", {
                assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
                managedPolicies: [ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole")],
                inlinePolicies: {inline0: new PolicyDocument({
                    statements: [
                        new PolicyStatement({
                            effect: Effect.ALLOW,
                            actions: [
                                "secretsmanager:GetSecretValue"
                            ],
                            resources: [eventSecret.secretArn]
                        })
                    ]
                })}
            });
    
            const getEventSecretFunction = new Function(this, "GetEventSecretFunction", {
                runtime: Runtime.NODEJS_16_X,
                role: getEventSecretRole,
                handler: "index.handler",
                timeout: Duration.seconds(30),
                code: Code.fromAsset(__dirname+"/resources/lambda/GetEventSecret"),
                environment: {
                    EVENT_SECRET_ARN: eventSecret.secretArn
                }
            }) 

            props.httpApi.addRoutes({
                path: "/event/details",
                methods: [HttpMethod.GET],
                integration: new HttpLambdaIntegration("getEventSecretIntegration", getEventSecretFunction),
                authorizer: props.httpiApiUserPoolAuthorizer
            })

            // uiPayload.InfraStack.RegisterProductTable = {
            //     "Name": registerProductTable.tableName,
            //     "Arn": registerProductTable.tableArn,
            //     "GSI-StatusIndex": gsiStatusIndexName
            // }

            uiPayload.InfraStack.DPMStateMachineArn = props.dpmStateMachineArn;

            // const registerProductInitialState = new Pass(this, "RegisterProductInitialState", {
            //     parameters: {
            //         "payload.$": "States.StringToJson($.detail.input)",
            //         "status.$": "$.detail.status",
            //         "createdAt.$": "$.detail.startDate"
            //     }
            // });

            // const mapTables = new Map(this, "TraverseTableArray", {
            //     itemsPath: "$.payload.tables",
            //     maxConcurrency: 2,
            //     parameters: {
            //         "producerAccountId.$": "$.payload.producer_acc_id",
            //         "databaseName.$": "$.payload.database_name",
            //         "status.$": "$.status",
            //         "createdAt.$": "$.createdAt",
            //         "table.$": "$$.Map.Item.Value"
            //     }
            // });

            // const putRegisterProductData = new CallAwsService(this, "PutRegisterProductData", {
            //     service: "dynamodb",
            //     action: "putItem",
            //     iamResources: [registerProductTable.tableArn],
            //     resultPath: JsonPath.DISCARD,
            //     parameters: {
            //         "TableName": registerProductTable.tableName,
            //         "Item": {
            //             "accountId": {
            //                 "S.$": "$.producerAccountId" 
            //             },
            //             "dbTableName": {
            //                 "S.$": "States.Format('{}_{}#{}', $.producerAccountId, $.databaseName, $.table.name)"
            //             },
            //             "location": {
            //                 "S.$": "$.table.location"
            //             },
            //             "status": {
            //                 "S.$": "$.status"
            //             },
            //             "createdAt": {
            //                 "N.$": "States.Format('{}', $.createdAt)"
            //             }
            //         }
            //     }
            // })

            // putRegisterProductData.endStates;
            // mapTables.iterator(putRegisterProductData).endStates;
            // registerProductInitialState.next(mapTables)

            // const registerProductSM = new StateMachine(this, "RegisterProductMetadata", {
            //     definition: registerProductInitialState,
            //     stateMachineType: StateMachineType.STANDARD
            // });

            // const registerProductUIRule = new Rule(this, 'RegisterProductUIRule', {
            //     eventPattern: {
            //         source: ["aws.states"],
            //         detailType: ["Step Functions Execution Status Change"],
            //         detail: {
            //             "stateMachineArn": [props.dpmStateMachineArn]
            //         }
            //     }
            // });

            // registerProductUIRule.addTarget(new SfnStateMachine(registerProductSM));

            // props.identityPool.authenticatedRole.attachInlinePolicy(new Policy(this, "UIDPMStateMachinePolicy", {
            //     statements: [   
            //         new PolicyStatement({
            //             effect: Effect.ALLOW,
            //             actions: [
            //                 "states:ListExecutions",
            //                 "states:StartExecution"   
            //             ],
            //             resources: [props.dpmStateMachineArn]
            //         }),
            //         new PolicyStatement({
            //             effect: Effect.ALLOW,
            //             actions: [
            //                 "states:DescribeExecution"
            //             ],
            //             resources: [util.format("arn:aws:states:%s:%s:execution:%s:*", Stack.of(this).region, Stack.of(this).account, props.dpmStateMachineArn.substring(props.dpmStateMachineArn.lastIndexOf(":")+1))]
            //         })
            //     ]
            // }));
        }

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
