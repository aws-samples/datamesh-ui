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
import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import { useEffect, useState } from "react";
import Amplify, { Auth } from "aws-amplify";
import { Button, Container, Form, FormField, Header, Input } from "@awsui/components-react";
const cfnOutput = require("../cfn-output.json");

const config = Amplify.configure();
const SM_ARN = cfnOutput.InfraStack.StateMachineArn;

function RequestAccessComponent({dbName, tableName, successHandler}) {
    const [targetAccount, setTargetAccount] = useState();
    const [error, setError] = useState();

    const submitRequestAccess = async() => {
        if (targetAccount && targetAccount.length > 0 && !isNaN(targetAccount)) {
            const credentials = await Auth.currentCredentials();
            const sfnClient = new SFNClient({region: config.aws_project_region, credentials: Auth.essentialCredentials(credentials)});
            try {
                const smExecutionParams = {
                    source: {
                        database: dbName,
                        table: tableName
                    },
                    target: {
                        account_id: targetAccount
                    }
                };

                const resp = await sfnClient.send(new StartExecutionCommand({
                    input: JSON.stringify(smExecutionParams),
                    stateMachineArn: SM_ARN
                }));

                setTargetAccount(null);

                if (successHandler) {
                    successHandler(resp.executionArn);
                }
            } catch (e) {
                setError("An unexpected error has occurred: "+e);
            }
        } else {
            setError("Target Account ID is a required field.");
        }
    }

    return (
        <Form actions={<Button variant="primary" onClick={submitRequestAccess}>Submit</Button>} errorText={error}>
            <Container header={<Header variant="h3">Request Access</Header>}>                                
                <FormField label="Target Account ID">
                    <Input type="number" value={targetAccount} onChange={event => setTargetAccount(event.detail.value)} />
                </FormField>
            </Container>
        </Form>
    );
}

export default RequestAccessComponent;