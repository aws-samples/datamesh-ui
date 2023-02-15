/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software and associated documentation files (the "Software"), to deal in the Software
 * without restriction, including without limitation the rights to use, copy, modify,
 * merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
 * PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
const {Approvals} = require("/opt/nodejs/approvals")

exports.handler = async (event) => {
    const input = event.Input;
    const taskToken = event.TaskToken;
    
    const targetAccountId = input.targetAccountId;
    const dbName = input.databaseName;
    const lfTags = input.lfTags;
    const sourceAccountId = input.producerAccountId

    const approvalsPayload = {
        TableName: process.env.APPROVALS_TABLE_NAME,
        Item: {
            "accountId": {
                "S": sourceAccountId
            },
            "requestIdentifier": {
                "S": `PENDING#${(new Date()).getTime()}`
            },
            "mode": {
                "S": "tbac"
            },
            "token": {
                "S": encodeURIComponent(taskToken)
            },
            "targetAccountId": {
                "S": targetAccountId
            },
            "sourceDomain": {
                "S": dbName
            },
            "lfTags": {
                "S": JSON.stringify(lfTags)
            }
        }
    }

    const productShareMappingPayload = {
        TableName: process.env.PRODUCT_SHARING_MAPPING_TABLE_NAME,
        Item: {
            "domainId": {
                "S": dbName
            },
            "resourceMapping": {
                "S": Approvals.generateLfTagRequestIdentifier(lfTags, targetAccountId)
            },
            "status": {
                "S": "pending"
            }
        }
    }

    await Approvals.recordApproval(sourceAccountId, approvalsPayload, productShareMappingPayload)
    
    return {};
};