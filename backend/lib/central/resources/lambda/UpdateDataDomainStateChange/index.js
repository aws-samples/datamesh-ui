const { DynamoDBClient, PutItemCommand } = require("@aws-sdk/client-dynamodb")

exports.handler = async({detail}) => {
    let state = null

    if (detail.crawlerInfo && detail.crawlerInfo.LastCrawl) {
        state = detail.crawlerInfo.LastCrawl.Status
    } else {
        state = detail.state
    }

    const payload = {
        dbName: {
            S: detail.dbName
        },
        tableName: {
            S: detail.tableName
        },
        state: {
            S: state.toLowerCase()
        }
    }

    if (detail.error) {
        payload.error = {
            S: detail.error
        }
    }

    const ddbClient = new DynamoDBClient
    const result = await ddbClient.send(new PutItemCommand({
        TableName: process.env.DDB_TABLE_NAME,
        Item: payload
    }))

    console.log(`Result: ${JSON.stringify(result)}`)
    return {}
}