const AWS = require("aws-sdk")
const CRAWLER_NAME_REGEX = /.+?(tbac.+?|nrac.+?)_rl-(.+)/

exports.handler = async({detail}) => {
    const {crawlerName, state, accountId} = detail
    let error = null;

    if (state == "Failed" && detail.errorMessage) {
        error = detail.errorMessage
    }

    const matchResults = CRAWLER_NAME_REGEX.exec(crawlerName)
    const dbName = `${matchResults[1]}-${accountId}`
    const tableName = matchResults[2]
    const payload = {
        dbName: dbName,
        tableName: tableName,
        state: state,
        error: error
    }

    const ebClient = new AWS.EventBridge()
    await ebClient.putEvents({
        Entries: [
            {
                Detail: JSON.stringify(payload),
                DetailType: "data-domain-crawler-update",
                EventBusName: process.env.CENTRAL_EVENT_BUS_ARN,
                Source: "data-domain-state-change"
            }
        ]
    }).promise()

    console.log(`Payload: ${JSON.stringify(payload)}`)
    return payload
}