import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { TableSearchInformation } from "../utilities";
const { Client } = require('@opensearch-project/opensearch');
const { AwsSigv4Signer } = require('@opensearch-project/opensearch/aws');
import * as AWS from "aws-sdk";

const opensearchDomainEndpoint = process.env.DOMAIN_ENDPOINT;
const awsRegion = process.env.AWS_REGION;

const client = new Client({
    ...AwsSigv4Signer({
        region: awsRegion,
        service: "aoss",
        getCredentials: () => 
            new Promise((resolve, reject) => {
                // Any other method to acquire a new Credentials object can be used.
                AWS.config.getCredentials((err, credentials) => {
                  if (err) {
                    reject(err);
                  } else {
                    resolve(credentials);
                  }
                });
            }),
    }),
    node: opensearchDomainEndpoint
})

interface OpensearchHit {
    _id: string;
    _score: number;
    _source: TableSearchInformation;
}

exports.handler = async (
    event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
    console.log(event);
    console.log(opensearchDomainEndpoint);

    const searchValue = event.pathParameters?.searchTerm;
    console.log(`Search term is: "${searchValue}"`);

    try {
        const searchBody = {
            query: {
                multi_match: {
                    query: searchValue,
                    type: "bool_prefix",
                    fields: [
                        "catalogName",
                        "databaseName",
                        "tableName",
                        "columnNames",
                    ],
                },
            },
        };

        const response = await client.search({
            index: process.env.OPENSEARCH_INDEX,
            body: searchBody
        })

        console.log(response.body);

        const hits: OpensearchHit[] = response.body?.hits?.hits ?? [];
        const searchResponse = hits.map((hit) => ({
            documentId: hit._id,
            score: hit._score,
            tableInformation: hit._source,
        }));

        return {
            statusCode: 200,
            headers: { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*' // replace with hostname of frontend 
              },
            body: JSON.stringify(searchResponse),
        };
    } catch (error) {
        console.log(error);
        return {
            statusCode: 500,
            body: "Internal search error",
        };
    }
};
