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
import { Amplify, Auth } from "aws-amplify";
import { useEffect, useState } from "react";
import {GlueClient, GetDatabasesCommand} from '@aws-sdk/client-glue';
import { Alert, Box, Button, ButtonDropdown, FormField, Header, Icon, Input, Link, Modal, SpaceBetween, Spinner, Table } from "@cloudscape-design/components";
import ResourceLFTagsComponent from "./TBAC/ResourceLFTagsComponent";
import { v4 as uuid } from 'uuid';
const cfnOutput = require("../cfn-output.json")
const config = Amplify.configure();
const axios = require("axios").default;

function CatalogComponent(props) {
    const [databases, setDatabases] = useState([]);
    const [response, setResponse] = useState(null);
    const [nextToken, setNextToken] = useState(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0)
    const [spinnerVisibility, setSpinnerVisibility] = useState(false)
    const [modalVisible, setModalVisible] = useState(false)
    const [modalError, setModalError] = useState(null)
    const [modalSuccess, setModalSuccess] = useState(null)
    const [domainName, setDomainName] = useState(null)
    const [domainSecretArn, setDomainSecretArn] = useState(null)
    const [registerSpinnerVisible, setRegisterSpinnerVisible] = useState(false)
    const [domainTags, setDomainTags] = useState([])
    const [registerDisabled, setRegisterDisabled] = useState(false)

    useEffect(() => {
        async function run() {
            const credentials = await Auth.currentCredentials();
            const glue = new GlueClient({region: config.aws_project_region, credentials: Auth.essentialCredentials(credentials)});
            const results = await glue.send(new GetDatabasesCommand({NextToken: nextToken}));
            const filteredResults = results.DatabaseList.filter(row => row.Parameters && row.Parameters.data_owner && row.Parameters.data_owner_name)
            setDatabases(databases => databases.concat(filteredResults));
            setResponse(results);
        }

        run()
    }, [refreshTrigger]);

    const refresh = async() => {
        setSpinnerVisibility(true)
        const currentSession = await Auth.currentSession();
        const refreshLfTagUrl = cfnOutput.InfraStack.WorkflowApiUrl + "/tags/sync-permissions";
        const refreshDataDomainPermissionsUrl = cfnOutput.InfraStack.WorkflowApiUrl + "/data-domains/sync-permissions";

        await Promise.all([
            axios({
                method: "POST",
                url: refreshLfTagUrl,
                headers: {
                    "Authorization": currentSession.getAccessToken().getJwtToken()
                }
            }),
            axios({
                method: "POST",
                url: refreshDataDomainPermissionsUrl,
                headers: {
                    "Authorization": currentSession.getAccessToken().getJwtToken()
                }
            })
        ])


        setDatabases([])
        setNextToken(null)
        setResponse(null)
        setRefreshTrigger(refreshTrigger + 1)
        setSpinnerVisibility(false)
    }

    const cancelModal = () => {
        clearRegisterDomainState()
        setModalVisible(false);
        setRegisterSpinnerVisible(false);
    }

    const clearRegisterDomainState = () => {
        setModalError(null);
        setModalSuccess(null);
        setDomainName(null)
        setDomainSecretArn(null)
        setDomainTags([])
        setRegisterDisabled(false)
    }

    const registerDataDomain = async() => {
        if (domainName && domainSecretArn) {
            const registerUrl = cfnOutput.InfraStack.WorkflowApiUrl + "/data-domain/register"
            const session = await Auth.currentSession()
            const domainId = domainSecretArn.split(":")[4]

            try {
                setRegisterSpinnerVisible(true)
                setRegisterDisabled(true)

                await axios({
                    method: "POST",
                    url: registerUrl,
                    headers: {
                        "Authorization": session.getAccessToken().getJwtToken(),
                        "Content-Type": "application/json"
                    },
                    data: {
                        "domainId": domainId,
                        "domainName": domainName,
                        "domainSecretArn": domainSecretArn,
                        "customLfTags": domainTags.map((tag) => ({TagKey: tag.TagKey, TagValues: [tag.TagValues]}))
                    }
                })

                cancelModal()
                await refresh()
            } catch(e) {
                if (e.response.data && e.response.data.error) {
                    setModalError(e.response.data.error)
                } else {
                    setModalError("An unexpected error has occurred, please verify if values are correct")
                }
                setRegisterSpinnerVisible(false);
                setRegisterDisabled(false)
            }
        } else {
            setModalError("Missing required fields")
        }

    }

    const showRegisterDataDomainModal = () => {
        clearRegisterDomainState()
        setModalVisible(true)
    }

    const renderRefresh = () => {
        if (spinnerVisibility) {
            return (
                <Button disabled="true"><Spinner /> Refresh</Button>
            )
        } else {
            return (
                <Button iconName="refresh" onClick={refresh}>Refresh</Button>
            )
        }
    }

    const renderRegisterDataDomain = () => {
        if (registerSpinnerVisible) {
            return (
                <Button disabled="true"><Spinner /> Register Data Domain</Button>
            )
        } else {
            return (
                <Button iconName="add-plus" onClick={showRegisterDataDomainModal}>Register Data Domain</Button>
            )
        }
    }

    const updateTagsField = (id, fieldName, value) => {
        const index = domainTags.findIndex(p => p.id == id);
        domainTags[index][fieldName] = value;
        setDomainTags([...domainTags]);
    }

    const removeRow = (id) => {
        setDomainTags(domainTags.filter(p => p.id != id))
    }

    const addRow = () => {
        setDomainTags([...domainTags, {"id": uuid(), "TagKeys": "", "TagValues": ""}])
    }

    return (
        <div>
            <Box margin={{top: "l"}}>
                <Table
                    footer={<Box textAlign="center" display={(response && response.NextToken) ? "block" : "none"}><Link variant="primary" onFollow={(event) => {setNextToken(response.NextToken);setRefreshTrigger(refreshTrigger + 1);} }>View More</Link></Box>}
                    columnDefinitions={[
                        {
                            header: "Name",
                            cell: item => <Link variant="primary" href={"/tables/"+item.Name}>{item.Name}</Link>

                        },
                        {
                            header: "Tags",
                            cell: item => <ResourceLFTagsComponent resourceType="database" resourceName={item.Name} />
                        },
                        {
                            header: "Owner",
                            cell: item => item.Parameters.data_owner_name + " ("+item.Parameters.data_owner+")"
                        },
                        {
                            header: "Actions",
                            cell: item => <ButtonDropdown expandToViewport="true" items={[
                                {text: "Register Data Product", href: `/product-registration/${item.Name}/new`},
                                {text: "View Tables", href: `/tables/${item.Name}`}
                            ]}>Actions</ButtonDropdown>
                        }
                    ]}

                    items={databases}
                    header={<Header variant="h2" actions={
                        <SpaceBetween direction="horizontal" size="s">
                            {renderRefresh()}
                            {renderRegisterDataDomain()}
                        </SpaceBetween>
                    }>Data Domains</Header>}
                />
             </Box>
             <Modal size="large" onDismiss={() => {setModalVisible(false)}} visible={modalVisible} header="Register Data Domain" footer={
                <SpaceBetween direction="horizontal" size="xs">
                    <Button variant="link" onClick={cancelModal} disabled={registerDisabled}>Cancel</Button>
                    <Button variant="primary" onClick={registerDataDomain} disabled={registerDisabled}>Register</Button>
                </SpaceBetween>}>
                <Alert type="error" header="Error" visible={modalError}>{modalError}</Alert>
                <FormField label="Domain Name">
                    <Input type="text" value={domainName} onChange={event => setDomainName(event.detail.value)} />
                </FormField>
                <FormField label="Domain Secret ARN">
                    <Input type="text" value={domainSecretArn} onChange={event => setDomainSecretArn(event.detail.value)} />
                </FormField>
                <Box margin={{top: "m"}}>
                    <Table footer={<Button iconName="add-plus" onClick={() => {addRow()}}>Add Tag</Button>} items={domainTags} header={<Header variant="h3">Tags to Apply</Header>} columnDefinitions={[
                        {
                            header: "Tag Key",
                            cell: e => <Input type="text" placeholder="Enter Key" value={e.TagKey} onChange={(event) => updateTagsField(e.id, "TagKey", event.detail.value)} />
                        },
                        {
                            header: "Tag Value",
                            cell: e => <Input type="text" placeholder="Enter Values" value={e.TagValues} onChange={(event) => updateTagsField(e.id, "TagValues", event.detail.value)} />
                        },
                        {
                            header: "",
                            cell: e => <Button onClick={() => removeRow(e.id)}><Icon name="close" /> Remove</Button>
                        }
                    ]}></Table>
                </Box>
            </Modal>
        </div>
    );
}

export default CatalogComponent;