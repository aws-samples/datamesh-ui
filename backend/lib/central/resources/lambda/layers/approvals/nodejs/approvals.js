const AWS = require("aws-sdk")

const SORT_KEY_COUNTER_NAME = "itemsForApproval"
const ddbClient = new AWS.DynamoDB()
const sfnClient = new AWS.StepFunctions()
const EXCLUDED_KEY = "LoB"

const Approvals = {
    generateLfTagRequestIdentifier(lfTags, targetAccountId) {
        const buffer = Buffer.from(JSON.stringify(lfTags))
        return `tags-${buffer.toString('base64')}#${targetAccountId}`
    },
    async processApproval(sourceAccountId, requestIdentifier, actionType, approvalsTableName, productShareMappingTableName) {
        const resp = await ddbClient.getItem({
            TableName: approvalsTableName,
            Key: {
                "accountId": {
                    "S": sourceAccountId
                },
                "requestIdentifier": {
                    "S": requestIdentifier
                }
            }
        }).promise()

        if (resp && resp.Item) {
            const {Item} = resp
            const {token, mode, sourceDomain, targetAccountId} = Item

            switch (actionType) {
                case "approve":
                    await sfnClient.sendTaskSuccess({taskToken: decodeURIComponent(token.S), output: "{}"}).promise()
                    break;
                case "reject":
                    await sfnClient.sendTaskFailure({taskToken: decodeURIComponent(token.S)}).promise()
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

            const updateResp = await ddbClient.transactWriteItems({
                TransactItems: transactPayload
            }).promise()

            return updateResp
        }

        throw new Error("Record not found")
    },
    async getNumberOfPendingRecords(sourceAccountId, approvalsTableName) {
        const resp = await ddbClient.getItem({
            TableName: approvalsTableName,
            Key: {
                "accountId": {
                    "S": sourceAccountId
                },
                "requestIdentifier": {
                    "S": SORT_KEY_COUNTER_NAME
                }
            }
        }).promise()

        if (resp && resp.Item) {
            return resp.Item.pendingCount.N
        }

        return 0
    },
    async recordApproval(sourceAccountId, approvalPayload, productShareMappingPayload) {
        await ddbClient.transactWriteItems({
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
        }).promise()

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