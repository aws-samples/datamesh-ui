const { SFNClient, SendTaskSuccessCommand, SendTaskFailureCommand } = require("@aws-sdk/client-sfn");
const { DynamoDBClient, GetItemCommand, TransactWriteItemsCommand } = require("@aws-sdk/client-dynamodb");

const SORT_KEY_COUNTER_NAME = "itemsForApproval"
const ddbClient = new DynamoDBClient()
const sfnClient = new SFNClient()
const EXCLUDED_KEY = "LoB"

const Approvals = {
    generateLfTagRequestIdentifier(lfTags, targetAccountId) {
        const buffer = Buffer.from(JSON.stringify(lfTags))
        return `tags-${buffer.toString('base64')}#${targetAccountId}`
    },
    async processApproval(sourceAccountId, requestIdentifier, actionType, approvalsTableName, productShareMappingTableName) {
        const resp = await ddbClient.send(new GetItemCommand({
            TableName: approvalsTableName,
            Key: {
                "accountId": {
                    "S": sourceAccountId
                },
                "requestIdentifier": {
                    "S": requestIdentifier
                }
            }
        }))

        if (resp && resp.Item) {
            const {Item} = resp
            const {token, mode, sourceDomain, targetAccountId} = Item

            switch (actionType) {
                case "approve":
                    await sfnClient.send(new SendTaskSuccessCommand({taskToken: decodeURIComponent(token.S), output: "{}"}))
                    break;
                case "reject":
                    await sfnClient.send(new SendTaskFailureCommand({taskToken: decodeURIComponent(token.S)}))
                    break;
                default:
                    throw new Error("Invalid actionType")
            }

            const transactPayload = [
                {
                    Delete: {
                        TableName: approvalsTableName,
                        Key: {
                            "accountId": {
                                "S": sourceAccountId
                            },
                            "requestIdentifier": {
                                "S": requestIdentifier
                            }
                        }
                    }
                },
                {
                    Update: {
                        TableName: approvalsTableName,
                        Key: {
                            "accountId": {
                                "S": sourceAccountId
                            },
                            "requestIdentifier": {
                                "S": SORT_KEY_COUNTER_NAME
                            }
                        },
                        UpdateExpression: "SET pendingCount = pendingCount - :num",
                        ExpressionAttributeValues: {
                            ":num": {
                                "N": "1"
                            }
                        }
                    }
                }
            ]

            if (actionType == "reject") {
                let rejectPayload = null

                if (mode.S == "tbac") {
                    const {lfTags} = Item
                    rejectPayload = {
                        TableName: productShareMappingTableName,
                        Key: {
                            "domainId": {
                                "S": sourceDomain.S
                            },
                            "resourceMapping": {
                                "S": `tags-${(Buffer.from(lfTags.S)).toString("base64")}#${targetAccountId.S}`
                            }
                        },
                        UpdateExpression: "SET #status = :status",
                        ExpressionAttributeNames: {
                            "#status": "status"
                        },
                        ExpressionAttributeValues: {
                            ":status": {
                                "S": "rejected"
                            }
                        }
                    }
                } else if (mode.S == "nrac") {
                    const {sourceProduct} = Item
                    rejectPayload = {
                        TableName: productShareMappingTableName,
                        Key: {
                            "domainId": {
                                "S": sourceDomain.S
                            },
                            "resourceMapping": {
                                "S": `${sourceProduct.S}#${targetAccountId.S}`
                            }
                        },
                        UpdateExpression: "SET #status = :status",
                        ExpressionAttributeNames: {
                            "#status": "status"
                        },
                        ExpressionAttributeValues: {
                            ":status": {
                                "S": "rejected"
                            }
                        }
                    }
                }

                transactPayload.push({Update: rejectPayload})
            }

            const updateResp = await ddbClient.send(new TransactWriteItemsCommand({
                TransactItems: transactPayload
            }))

            return updateResp
        }

        throw new Error("Record not found")
    },
    async getNumberOfPendingRecords(sourceAccountId, approvalsTableName) {
        const resp = await ddbClient.send(new GetItemCommand({
            TableName: approvalsTableName,
            Key: {
                "accountId": {
                    "S": sourceAccountId
                },
                "requestIdentifier": {
                    "S": SORT_KEY_COUNTER_NAME
                }
            }
        }))

        if (resp && resp.Item) {
            return resp.Item.pendingCount.N
        }

        return 0
    },
    async recordApproval(sourceAccountId, approvalPayload, productShareMappingPayload) {
        await ddbClient.send(new TransactWriteItemsCommand({
            TransactItems: [
                {
                    Put: approvalPayload
                },
                {
                    Update: {
                        TableName: approvalPayload.TableName,
                        Key: {
                            "accountId": {
                                "S": sourceAccountId
                            },
                            "requestIdentifier": {
                                "S": SORT_KEY_COUNTER_NAME
                            }
                        },
                        UpdateExpression: "SET pendingCount = if_not_exists(pendingCount, :initValue) + :num",
                        ExpressionAttributeValues: {
                            ":initValue": {
                                "N": "0"
                            },
                            ":num": {
                                "N": "1"
                            }
                        }
                    }
                },
                {
                    Put: productShareMappingPayload
                }
            ]
        }))

        // await ddbClient.putItem(approvalPayload).promise()
        // await ddbClient.updateItem({
        //     TableName: approvalPayload.TableName,
        //     Key: {
        //         "accountId": {
        //             "S": sourceAccountId
        //         },
        //         "requestIdentifier": {
        //             "S": SORT_KEY_COUNTER_NAME
        //         }
        //     },
        //     UpdateExpression: "SET pendingCount = pendingCount + :num",
        //     ExpressionAttributeValues: {
        //         ":num": {
        //             "N": "1"
        //         }
        //     }
        // }).promise()
    }
}

exports.Approvals = Approvals