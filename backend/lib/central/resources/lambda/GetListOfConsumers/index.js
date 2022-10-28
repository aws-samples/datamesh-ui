const AWS = require("aws-sdk")
const DOMAIN_NAME_PATTERN = /.+?(\d+)$/

exports.handler = async(event) => {
    const userClaims = event.requestContext.authorizer.jwt.claims
    const ddbClient = new AWS.DynamoDB()
    const userId = userClaims.sub

    const payload = {
        "statusCode": "200",
        "headers": {
            "Content-Type": "application/json",
            'Access-Control-Allow-Origin': '*'
        }
    }

    const {queryStringParameters} = event

    if (queryStringParameters.domainId && queryStringParameters.product) {
        const {domainId, product} = queryStringParameters
        const accountId = DOMAIN_NAME_PATTERN.exec(domainId)[1]
        const userMapping = (await ddbClient.getItem({
            TableName: process.env.USER_MAPPING_TABLE_NAME,
            ConsistentRead: false,
            Key: {
                "userId": {
                    "S": userId
                },
                "accountId": {
                    "S": accountId
                }
            }
        }).promise()).Item

        if (userMapping) {
            let consumerAccountIds = []
            let token = null

            do {
                const queryResp = (await ddbClient.query({
                    TableName: process.env.MAPPING_TABLE_NAME,
                    KeyConditionExpression: "domainId = :domainId and begins_with(resourceMapping, :resourceMapping)",
                    ConsistentRead: true,
                    ExpressionAttributeValues: {
                        ":domainId": {
                            "S": domainId
                        },
                        ":resourceMapping": {
                            "S": product
                        }
                    }
                }).promise())

                token = queryResp.LastEvaluatedKey
                consumerAccountIds = consumerAccountIds.concat(queryResp.Items.map((row) => {
                    return {"accountId": row.resourceMapping.S.split("#")[1]}
                }))

            } while (token)

            payload.body = JSON.stringify({"consumerAccountIds": consumerAccountIds})
        } else {
            payload.statusCode = "404",
            payload.body = JSON.stringify({"error": "Not found"})            
        }
    } else {
        payload.statusCode = "404",
        payload.body = JSON.stringify({"error": "Not found"})
    }

    return payload
}