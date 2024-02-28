const { EventBridgeClient, PutEventsCommand } = require("@aws-sdk/client-eventbridge");
const CRAWLER_NAME_REGEX = /.+?(tbac.+?|nrac.+?)_rl-(.+)/

const NRAC_NAME_REGEX = /.+?(nrac.+?)_rl-(.+)/
const TBAC_NAME_REGEX = /.+?rl-(tbac.+?)_(.+)/

exports.handler = async({detail}) => {
    const {crawlerName, state, accountId} = detail
    let error = null;

    if (state == "Failed" && detail.errorMessage) {
        error = detail.errorMessage
    }

    let matchResults = null
    let dbName = null;

    if (NRAC_NAME_REGEX.test(crawlerName)) {
        matchResults = NRAC_NAME_REGEX.exec(crawlerName)
        dbName = `${matchResults[1]}-${accountId}`
    } else if (TBAC_NAME_REGEX.test(crawlerName)) {
        matchResults = TBAC_NAME_REGEX.exec(crawlerName)
        dbName = matchResults[1]
    }

    const tableName = matchResults[2]
    const payload = {
        dbName: dbName,
        tableName: tableName,
        state: state,
        error: error
    }

    const client = new EventBridgeClient()
    await client.send(new PutEventsCommand({
        Entries: [
            {
                Detail: JSON.stringify(payload),
                DetailType: "data-domain-crawler-update",
                EventBusName: process.env.CENTRAL_EVENT_BUS_ARN,
                Source: "data-domain-state-change"
            }
        ]
    }))

    console.log(`Payload: ${JSON.stringify(payload)}`)
    return payload
}