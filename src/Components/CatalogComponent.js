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
import {GlueClient, GetDatabasesCommand, GetDatabaseCommand} from '@aws-sdk/client-glue';
import { Alert, Box, Button, ButtonDropdown, FormField, Header, Icon, Input, Link, Modal, SpaceBetween, Spinner, Table, TextFilter } from "@cloudscape-design/components";
import ResourceLFTagsComponent from "./TBAC/ResourceLFTagsComponent";
import { v4 as uuid } from 'uuid';
import DataDomain from "../Backend/DataDomain";
import DataDomainActionComponent from "./DataDomainActionComponent";
const cfnOutput = require("../cfn-output.json")
const config = Amplify.configure();
const axios = require("axios").default;
const SECRETS_MANAGER_ARN_REGEX_PATTERN = /^arn:aws:secretsmanager:.+?:\d{12}:secret:domain\-config.*$/
const ACCOUNT_ID_REGEX_PATTERN = /^\d{12}$/

function CatalogComponent(props) {
    const [databases, setDatabases] = useState([]);
    const [response, setResponse] = useState(null);
    const [nextToken, setNextToken] = useState(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0)
    const [spinnerVisibility, setSpinnerVisibility] = useState(false)
    const [modalVisible, setModalVisible] = useState(false)
    const [modalError, setModalError] = useState(null)
    const [modalSuccess, setModalSuccess] = useState(null)
    const [domainSecretArn, setDomainSecretArn] = useState(null)
    const [registerSpinnerVisible, setRegisterSpinnerVisible] = useState(false)
    const [domainTags, setDomainTags] = useState([])
    const [registerDisabled, setRegisterDisabled] = useState(false)
    const [filterAccountId, setFilterAccountId] = useState(null)
    const [filtered, setFiltered] = useState(false)

    useEffect(() => {
        async function run() {
            const credentials = await Auth.currentCredentials();
            const glue = new GlueClient({region: config.aws_project_region, credentials: Auth.essentialCredentials(credentials)});
            if (!ACCOUNT_ID_REGEX_PATTERN.test(filterAccountId)) {
                const results = await glue.send(new GetDatabasesCommand({NextToken: nextToken}));
                const filteredResults = results.DatabaseList.filter(row => row.Parameters && row.Parameters.data_owner && row.Parameters.data_owner_name)
                setDatabases(databases => databases.concat(filteredResults));
                setResponse(results);
                setFiltered(false)
            } else {
                try {
                    setFiltered(true)
                    const filteredDatabases = await Promise.allSettled([
                        glue.send(new GetDatabaseCommand({Name: `nrac-data-domain-${filterAccountId}`})),
                        glue.send(new GetDatabaseCommand({Name: `tbac-data-domain-${filterAccountId}`}))
                    ])

                    if (filteredDatabases.length == 2) {
                        const finalizedFiltered = []
                        
                        if (filteredDatabases[0].status == "fulfilled") {
                            finalizedFiltered.push(filteredDatabases[0].value.Database)
                        }

                        if (filteredDatabases[1].status == "fulfilled") {
                            finalizedFiltered.push(filteredDatabases[1].value.Database)
                        }

                        setDatabases(finalizedFiltered)
                        setResponse(null)
                    } else {
                        setFiltered(false)
                        setResponse(null)
                        setDatabases([])                        
                    }
                } catch (e) {
                    setFiltered(false)
                    setResponse(null)
                    setDatabases([])
                }
            }
        }

        run()
    }, [refreshTrigger]);

    const refresh = async() => {
        setSpinnerVisibility(true)

        await DataDomain.refresh()

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
        setDomainSecretArn(null)
        setDomainTags([])
        setRegisterDisabled(false)
    }

    const registerDataDomain = async() => {
        if (domainSecretArn) {
            if (SECRETS_MANAGER_ARN_REGEX_PATTERN.test(domainSecretArn)) {
                const domainId = domainSecretArn.split(":")[4]
    
                try {
                    setRegisterSpinnerVisible(true)
                    setRegisterDisabled(true)
    
                    await DataDomain.register(domainId, domainSecretArn, domainTags)
    
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
                setModalError("Invalid data domain secret arn")
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

    const renderModalRegisterButton = () => {
        if (registerSpinnerVisible) {
            return (
                <Button disabled="true"><Spinner /> Register</Button>
            )
        } else {
            return (
                <Button variant="primary" onClick={registerDataDomain}>Register</Button>
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

    const doFilter = async() => {
        if ((!ACCOUNT_ID_REGEX_PATTERN.test(filterAccountId) && filtered) || ACCOUNT_ID_REGEX_PATTERN.test(filterAccountId)) {
            setDatabases([])
            setRefreshTrigger(refreshTrigger + 1)
        }
    }

    return (
        <div>
            <Box margin={{top: "l"}}>
                <Table
                    filter={
                        <TextFilter filteringPlaceholder="Filter by Account ID" filteringText={filterAccountId} onDelayedChange={() => {doFilter()}} onChange={({detail}) => setFilterAccountId(detail.filteringText)} />
                    }
                    footer={<Box textAlign="center" display={(response && response.NextToken) ? "block" : "none"}><Link variant="primary" onFollow={(event) => {setNextToken(response.NextToken);setRefreshTrigger(refreshTrigger + 1);} }>View More</Link></Box>}
                    columnDefinitions={[
                        {
                            header: "Data Domain Database Name",
                            cell: item => <Link variant="primary" href={"/tables/"+item.Name}>{item.Name}</Link>

                        },
                        {
                            header: "Tags",
                            cell: item => <ResourceLFTagsComponent resourceType="database" resourceName={item.Name} />
                        },
                        {
                            header: "Data Domain Name",
                            cell: item => item.Parameters.data_owner_name + " ("+item.Parameters.data_owner+")"
                        },
                        {
                            header: "Actions",
                            cell: item => <DataDomainActionComponent item={item} />
                        }
                    ]}

                    items={databases}
                    header={<Header variant="h2" actions={
                        <SpaceBetween direction="horizontal" size="s">
                            {renderRefresh()}
                            {renderRegisterDataDomain()}
                        </SpaceBetween>
                    }>Data Domains</Header>}
                    empty={
                        <Box textAlign="center">
                            <b>No Registered Data Domain</b>
                            <Box margin={{top: "m"}}>
                                {renderRegisterDataDomain()}
                            </Box>
                        </Box>
                    }
                />
             </Box>
             <Modal size="large" onDismiss={() => {setModalVisible(false)}} visible={modalVisible} header="Register Data Domain" footer={
                <SpaceBetween direction="horizontal" size="xs">
                    <Button variant="link" onClick={cancelModal} disabled={registerDisabled}>Cancel</Button>
                    {renderModalRegisterButton()}
                </SpaceBetween>}>
                <Alert type="error" header="Error" visible={modalError}>{modalError}</Alert>
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