const {Approvals} = require("/opt/nodejs/approvals")
const {DataDomain} = require("/opt/nodejs/data-domain")

exports.handler = async(event) => {
    const userId = DataDomain.extractUserId(event)
    const domainIds = await DataDomain.getUserDataDomains(userId, process.env.USER_MAPPING_TABLE_NAME)
    let totalCount = 0
    
    for (const domainId of domainIds) {
        totalCount += parseInt(await Approvals.getNumberOfPendingRecords(domainId, process.env.APPROVALS_TABLE_NAME))
    }

    return {
        "statusCode": "200",
        "headers": {
            "Content-Type": "application/json",
            'Access-Control-Allow-Origin': '*'
        },
        "body": JSON.stringify({
            "pendingCount": totalCount
        })
    }
}