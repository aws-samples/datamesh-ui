const { S3Client, ListObjectsV2Command } = require("@aws-sdk/client-s3")

exports.handler = async(event) => {
    const payload = JSON.parse(event.body)

    const s3Client = new S3Client

    const results = {
        "valid": true,
        "products": {}
    }

    const bucket = payload.bucket;

    for (const prod of payload.products) {
        try {
            const result = await s3Client.send(new ListObjectsV2Command({
                Bucket: bucket,
                Prefix: prod.prefix
            }))

            if (!result.Contents || result.Contents.length == 0) {
                results.valid = false
                prod.error = "Invalid path or location is empty."
            }
        } catch (e) {
            console.log(JSON.stringify(e))
            results.valid = false
            prod.error = "Unexpected error, please try again."
        }

        results.products[prod.id] = prod
    }

    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "application/json",
            'Access-Control-Allow-Origin': '*'
        },
        "body": JSON.stringify(results)
    }
}