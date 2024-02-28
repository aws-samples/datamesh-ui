const { LakeFormationClient, GetLFTagCommand, UpdateLFTagCommand, CreateLFTagCommand, GrantPermissionsCommand, RegisterResourceCommand, AddLFTagsToResourceCommand, BatchGrantPermissionsCommand } = require("@aws-sdk/client-lakeformation");
const { GlueClient, GetDatabaseCommand, CreateDatabaseCommand } = require("@aws-sdk/client-glue")
const { IAMClient, CreateRoleCommand, PutRolePolicyCommand } = require("@aws-sdk/client-iam")
const { EventBridgeClient, PutPermissionCommand, PutRuleCommand, PutTargetsCommand } = require("@aws-sdk/client-eventbridge")
const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");
const { LambdaClient, InvokeCommand } = require("@aws-sdk/client-lambda")
const { DynamoDBClient, PutItemCommand } = require("@aws-sdk/client-dynamodb")

const DOMAIN_DATABASE_PREFIX = "data-domain"
const DOMAIN_BUS_NAME = 'data-mesh-bus';
const LF_MODE_TBAC = "tbac"
const LF_MODE_NRAC = "nrac"
const CONFIDENTIALITY_NON_SENSITIVE = "non-sensitive"
const CONFIDENTIALITY_SENSITIVE = "sensitive"
const UI_AUTH_ROLE_ARN = process.env.UI_AUTH_ROLE_ARN

const createOrUpdateLFTags = async(lfClient, key, values, targetRole, permissions) => {
    if (!targetRole) {
        targetRole = UI_AUTH_ROLE_ARN
    }

    if (!permissions) {
        permissions = "DESCRIBE"
    }

    if (key && values) {
        try {
            await lfClient.send(new GetLFTagCommand({TagKey: key}))
            await lfClient.send(new UpdateLFTagCommand({
                TagKey: key,
                TagValuesToAdd: values
            }))
        } catch (e) {
            await lfClient.send(new CreateLFTagCommand({
                TagKey: key,
                TagValues: values
            }))
        }
    }

    const refreshedTag = await lfClient.send(new GetLFTagCommand({TagKey: key}))

    await lfClient.send(new GrantPermissionsCommand({
        Permissions: [permissions],
        Principal: {
            DataLakePrincipalIdentifier: targetRole
        },
        Resource: {
            LFTag: {
                TagKey: refreshedTag.TagKey,
                TagValues: refreshedTag.TagValues
            }
        }
    }))
}

exports.handler = async(event) => {
    const returnPayload = {
        "statusCode": 200,
        "headers": {
            "Content-Type": "application/json",
            'Access-Control-Allow-Origin': '*'
        }
    }
    const workflowRoleArn = process.env.WORKFLOW_ROLE_ARN
    const domainTagKey = process.env.DOMAIN_TAG_KEY
    const confidentialityTagKey = process.env.CONFIDENTIALITY_TAG_KEY
    const defaultConfidentiality = process.env.DEFAULT_CONFIDENTIALITY
    const {domainId, domainSecretArn, customLfTags} = JSON.parse(event.body)
    const lfModes = [LF_MODE_TBAC, LF_MODE_NRAC]
    const awsRegion = process.env.AWS_REGION
    const centralEventBusArn = process.env.CENTRAL_EVENT_BUS_ARN
    const centralEventBusName = centralEventBusArn.split("/")[1]
    const dataDomainBusArn = `arn:aws:events:${awsRegion}:${domainId}:event-bus/${DOMAIN_BUS_NAME}`

    const secretsManagerClient = new SecretsManagerClient()
    const glueClient = new GlueClient()
    const iamClient = new IAMClient()
    const lfClient = new LakeFormationClient()
    const ebClient = new EventBridgeClient()

    let SecretString, BucketName, Prefix, KmsKeyId, DomainName, domainName = null;

    const userClaims = event.requestContext.authorizer.jwt.claims

    try {
        const secretsResult = await secretsManagerClient.send(new GetSecretValueCommand({SecretId: domainSecretArn}))
        SecretString = secretsResult.SecretString
    } catch (e) {
        console.log(JSON.stringify(e))
        returnPayload.statusCode = 400
        returnPayload.body = JSON.stringify({"error": "Invalid data domain secret."})
        return returnPayload
    }

    ({DomainName, BucketName, Prefix, KmsKeyId} = JSON.parse(SecretString))

    domainName = DomainName

    const lambdaClient = new LambdaClient()
    await lambdaClient.send(new InvokeCommand({
        FunctionName: process.env.ADJUST_RESOURCE_POLICY_FUNC_NAME,
        Payload: JSON.stringify({
            "accountId": domainId
        })
    }))

    const validationCheck = await Promise.allSettled([
        glueClient.send(new GetDatabaseCommand({Name: `${LF_MODE_NRAC}-${DOMAIN_DATABASE_PREFIX}-${domainId}`})),
        glueClient.send(new GetDatabaseCommand({Name: `${LF_MODE_TBAC}-${DOMAIN_DATABASE_PREFIX}-${domainId}`}))        
    ])

    if (validationCheck[0].status == "fulfilled" || validationCheck[1].status == "fulfilled") {
        returnPayload.statusCode = 400
        returnPayload.body = JSON.stringify({"error": "Data domain has already been registered."})
        return returnPayload
    }

    const createRoleResult = await iamClient.send(new CreateRoleCommand({
        RoleName: `${DOMAIN_DATABASE_PREFIX}-${domainId}-accessRole`,
        AssumeRolePolicyDocument: JSON.stringify({
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Effect": "Allow",
                    "Principal": {
                        "Service": "lakeformation.amazonaws.com"
                    },
                    "Action": "sts:AssumeRole"
                }
            ]
        })
    }))

    // await iamClient.putRolePolicy({
    //     PolicyName: `AllowRoleAccess_${domainId}`,
    //     PolicyDocument: JSON.stringify({
    //         "Version": "2012-10-17",
    //         "Statement": [
    //             {
    //                 "Effect": "Allow",
    //                 "Action": [
    //                     "iam:GetRole",
    //                     "iam:PassRole"
    //                 ],
    //                 "Resource": [
    //                     createRoleResult.Role.Arn
    //                 ]
    //             }
    //         ]
    //     }),
    //     RoleName: process.env.LAMBDA_EXEC_ROLE_NAME
    // }).promise()

    for (let mode of lfModes) {
        const dbName = `${mode}-${DOMAIN_DATABASE_PREFIX}-${domainId}`;
        await glueClient.send(new CreateDatabaseCommand({
            DatabaseInput: {
                Description: `Database for data products in ${domainName} data domain. Account id: ${domainId}. LF Access Control mode: ${mode}`,
                Name: dbName,
                LocationUri: `s3://${BucketName}/${Prefix}`,
                Parameters: {
                    data_owner: domainId,
                    data_owner_name: domainName,
                    pii_flag: "false",
                    access_mode: mode
                }
            }
        }))

        await lfClient.send(new GrantPermissionsCommand({
            Permissions: ["ALL"],
            Principal: {
                DataLakePrincipalIdentifier: workflowRoleArn
            },
            Resource: {
                Database: {
                    Name: dbName
                }
            }
        }))

        await lfClient.send(new GrantPermissionsCommand({
            Permissions: ["DESCRIBE"],
            Principal: {
                DataLakePrincipalIdentifier: UI_AUTH_ROLE_ARN
            },
            Resource: {
                Database: {
                    Name: dbName
                }
            }
        }))
    }

    await createOrUpdateLFTags(lfClient, confidentialityTagKey, null, process.env.LAMBDA_EXEC_ROLE_ARN, "ASSOCIATE")

    await iamClient.send(new PutRolePolicyCommand({
        PolicyName: "AllowDataAccess",
        PolicyDocument: JSON.stringify({
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Effect": "Allow",
                    "Action": [
                        "s3:GetObject*",
                        "s3:GetBucket*",
                        "s3:List*",
                        "s3:DeleteObject*",
                        "s3:PutObject",
                        "s3:PutObjectLegalHold",
                        "s3:PutObjectRetention",
                        "s3:PutObjectTagging",
                        "s3:PutObjectVersionTagging",
                        "s3:Abort*",
                    ],
                    "Resource": [
                        `arn:aws:s3:::${BucketName}`,
                        `arn:aws:s3:::${BucketName}/${Prefix}/*`
                    ]
                }
            ]
        }),
        RoleName: `${DOMAIN_DATABASE_PREFIX}-${domainId}-accessRole`
    }))

    if (KmsKeyId) {
        await iamClient.send(new PutRolePolicyCommand({
            PolicyName: "AllowEncryptedDataAccess",
            PolicyDocument: JSON.stringify({
                "Version": "2012-10-17",
                "Statement": [
                    {
                        "Effect": "Allow",
                        "Action": [
                            'kms:Encrypt*',
                            'kms:Decrypt*',
                            'kms:ReEncrypt*',
                            'kms:GenerateDataKey*',
                            'kms:Describe*'
                        ],
                        "Resource": [
                            `arn:aws:kms:${awsRegion}:${domainId}:key/${KmsKeyId}`
                        ]
                    }
                ]
            }),
            RoleName: `${DOMAIN_DATABASE_PREFIX}-${domainId}-accessRole`
        }))
    }

    await lfClient.send(new RegisterResourceCommand({
        ResourceArn: `arn:aws:s3:::${BucketName}/${Prefix}/*`,
        UseServiceLinkedRole: false,
        RoleArn: createRoleResult.Role.Arn
    }))

    await createOrUpdateLFTags(lfClient, domainTagKey, [domainName])

    await lfClient.send(new AddLFTagsToResourceCommand({
        LFTags: [
            {
                TagKey: domainTagKey,
                TagValues: [domainName]
            },
            {
                TagKey: confidentialityTagKey,
                TagValues: [defaultConfidentiality]
            }
        ],
        Resource: {
            Database: {
                Name: `${LF_MODE_TBAC}-${DOMAIN_DATABASE_PREFIX}-${domainId}`
            }
        }
    }))

    await lfClient.send(new BatchGrantPermissionsCommand({
        Entries: [
            {
                Id: 'GrantDomainTagAccess',
                Permissions: ["ASSOCIATE"],
                PermissionsWithGrantOption: ["ASSOCIATE"],
                Principal: {
                    DataLakePrincipalIdentifier: domainId
                },
                Resource: {
                    LFTag: {
                        TagKey: domainTagKey,
                        TagValues: [domainName]
                    }
                }
            },
            {
                Id: 'GrantConfidentialityTagAccess',
                Permissions: ["ASSOCIATE"],
                PermissionsWithGrantOption: ["ASSOCIATE"],
                Principal: {
                    DataLakePrincipalIdentifier: domainId
                },
                Resource: {
                    LFTag: {
                        TagKey: confidentialityTagKey,
                        TagValues: [CONFIDENTIALITY_NON_SENSITIVE, CONFIDENTIALITY_SENSITIVE]
                    }
                }
            },
            {
                Id: 'GrantTagBasedTableActions',
                Permissions: ["ALL"],
                PermissionsWithGrantOption: ["ALL"],
                Principal: {
                    DataLakePrincipalIdentifier: domainId
                },
                Resource: {
                    LFTagPolicy: {
                        ResourceType: "TABLE",
                        Expression: [
                            {
                                TagKey: domainTagKey,
                                TagValues: [domainName]
                            }
                        ]
                    }
                }
            },
            {
                Id: 'GrantTagBasedDBActions',
                Permissions: ["CREATE_TABLE", "DESCRIBE"],
                PermissionsWithGrantOption: ["CREATE_TABLE", "DESCRIBE"],
                Principal: {
                    DataLakePrincipalIdentifier: domainId
                },
                Resource: {
                    LFTagPolicy: {
                        ResourceType: "DATABASE",
                        Expression: [
                            {
                                TagKey: domainTagKey,
                                TagValues: [domainName]
                            }
                        ]
                    }
                }
            }
        ]
    }))

    if (customLfTags && customLfTags.length > 0) {
        const finalCustomLfTags = []
        for (let customLfTag of customLfTags) {
            if (customLfTag.TagKey != domainTagKey && customLfTag.TagKey != confidentialityTagKey) {
                await createOrUpdateLFTags(lfClient, customLfTag.TagKey, customLfTag.TagValues);
                await createOrUpdateLFTags(lfClient, customLfTag.TagKey, null, process.env.LAMBDA_EXEC_ROLE_ARN, "ASSOCIATE")
                await lfClient.send(new GrantPermissionsCommand({
                    Permissions: ["ASSOCIATE"],
                    PermissionsWithGrantOption: ["ASSOCIATE"],
                    Principal: {
                        DataLakePrincipalIdentifier: domainId
                    },
                    Resource: {
                        LFTag: {
                            TagKey: customLfTag.TagKey,
                            TagValues: customLfTag.TagValues
                        }
                    }
                }))

                finalCustomLfTags.push(customLfTag)
            }
        }

        if (finalCustomLfTags.length > 0) {
            await lfClient.send(new AddLFTagsToResourceCommand({
                LFTags: finalCustomLfTags,
                Resource: {
                    Database: {
                        Name: `${LF_MODE_TBAC}-${DOMAIN_DATABASE_PREFIX}-${domainId}`
                    }
                }
            }))
        }
    }

    await ebClient.send(new PutPermissionCommand({
        EventBusName: centralEventBusName,
        StatementId: `AllowDataDomainAccToPutEvents_${domainId}`,
        Action: "events:PutEvents",
        Principal: domainId
    }))

    await ebClient.send(new PutRuleCommand({
        Name: `${domainId}_createResourceLinks_rule`,
        EventBusName: centralEventBusName,
        EventPattern: JSON.stringify({
            "source": ["com.central.stepfunction"],
            "detail-type": [`${domainId}_createResourceLinks`]
        })
    }))

    await ebClient.send(new PutTargetsCommand({
        Rule: `${domainId}_createResourceLinks_rule`,
        Targets: [
            {
                Id: `${domainId}_createResourceLinks_target`,
                Arn: dataDomainBusArn,
                RoleArn: process.env.EB_XACCOUNT_ROLE_ARN
            }
        ],
        EventBusName: centralEventBusName
    }))

    const dynamodbClient = new DynamoDBClient
    await dynamodbClient.send(new PutItemCommand({
        TableName: process.env.USER_MAPPING_TABLE_NAME,
        Item: {
            "userId": {
                "S": userClaims.sub
            },
            "accountId": {
                "S": domainId
            },
            "role": {
                "S": "owner"
            }
        }
    }))

    returnPayload.body = JSON.stringify({"status": "200 OK"})
    return returnPayload
}