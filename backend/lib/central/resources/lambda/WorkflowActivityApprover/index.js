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
const { SFNClient, SendTaskFailureCommand, SendTaskSuccessCommand } = require("@aws-sdk/client-sfn");
const util = require("util");

exports.handler = async (event) => {
    const validActions = ["approve", "deny"];
    const action = event.queryStringParameters.action;
    const token = event.queryStringParameters.token;
    
    console.log("Action: "+action);
    console.log("Token: "+token);
    
    let statusCode = 200;
    let body = '';
    
    if (!validActions.includes(action) || token == null || token.length == 0) {
        statusCode = 400;
        body = 'Result: Invalid parameters';
    } else {
        const state = new SFNClient();
        try {
            if (action == 'deny') {
                let params = {
                    taskToken: token
                }
                await state.send(new SendTaskFailureCommand(params))
            } else if (action == 'approve') {
                let params = {
                    taskToken: token,
                    output: "{}"
                }
                await state.send(new SendTaskSuccessCommand(params))
            }
            body = util.format("OK\nResult:%s", action);
        } catch (error) {
            console.log("Error: "+error);
            statusCode = 400;
            body: error;
        }

    }
    
    const response = {
        statusCode: statusCode,
        body: body
    };
    
    return response;
};
