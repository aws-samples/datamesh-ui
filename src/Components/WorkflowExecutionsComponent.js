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
import Amplify, {Auth} from "aws-amplify";
import { useEffect, useState } from "react";
import { SFNClient, ListExecutionsCommand } from "@aws-sdk/client-sfn";
import { Header, Table, Link, Box } from "@awsui/components-react";
import BadgeStatus from "./BadgeStatus";
const cfnOutput = require("../cfn-output.json");

const config = Amplify.configure();
const SM_ARN = cfnOutput.InfraStack.StateMachineArn;

function WorkflowExecutionsComponent(props) {
    const [executions, setExecutions] = useState([]);
    const [response, setResponse] = useState();
    const [nextToken, setNextToken] = useState(null);

    useEffect(async() => {
        const credentials = await Auth.currentCredentials();
        const sfnClient = new SFNClient({region: config.aws_project_region, credentials: Auth.essentialCredentials(credentials)});
        const result = await sfnClient.send(new ListExecutionsCommand({
            maxResults: 20,
            nextToken: nextToken,
            stateMachineArn: SM_ARN
        }));
        
        setResponse(result);
        setExecutions(executions.concat(result.executions));
    }, [nextToken]);

    return (
        <div>
            <Table footer={<Box textAlign="center" display={(response && response.nextToken) ? "block" : "none"}><Link variant="primary" onFollow={(event) => setNextToken(response.nextToken)}>View More</Link></Box>} header={<Header variant="h2">Workflow Executions</Header>} items={executions} columnDefinitions={[
                {
                    header: "Name",
                    cell: item => <Link variant="primary" href={"/execution-details/"+item.executionArn}>{item.name}</Link>
                },
                {
                    header: "Start Date",
                    cell: item => item.startDate + ""
                },
                {
                    header: "Stop Date",
                    cell: item => item.stopDate + ""
                },
                {
                    header: "Status",
                    cell: item => <BadgeStatus>{item.status}</BadgeStatus>
                }
            ]} />
        </div>
    );
}

export default WorkflowExecutionsComponent;