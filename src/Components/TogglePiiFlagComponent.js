import { Badge, Spinner, Toggle } from "@cloudscape-design/components"
import { useContext, useEffect, useState } from "react"
import DataDomain from "../Backend/DataDomain"
import Tbac from "../Backend/Tbac"
import ResourceTagContext from "./TBAC/ResourceTagContext";

function TogglePiiFlagComponent(props) {
    const [spinner, setSpinner] = useState(false)
    const [owner, setOwner] = useState(false)
    const [piiFlag, setPiiFlag] = useState(false)
    const context = useContext(ResourceTagContext);

    useEffect(() => {
        setOwner(props.owner)

        if (props.type !== "tags") {
            const parameters = props.objectParameters
            if (parameters && "pii_flag" in parameters && parameters.pii_flag === "true") {
                setPiiFlag(true)
            }
        } else {
            let tags = null

            if (props.tags) {
                tags = props.tags
            } else if (props.resourceType && props.resourceType === "column") {
                if (context) {
                    const resourceTag = context.resourceTag
                    const filtered = (resourceTag.LFTagsOnColumns && resourceTag.LFTagsOnColumns.length > 0) ? resourceTag.LFTagsOnColumns.filter(record => record.Name == props.columnName) : [];
                    tags = filtered && filtered.length >= 1 ? filtered[0].LFTags : []
                }

            }

            if (tags) {
                const confidentialityTag = Tbac.extractConfidentialityTag(tags)
                if (confidentialityTag) {
                    const confidentialityValue = confidentialityTag.TagValues[0]

                    if (confidentialityValue == "sensitive") {
                        setPiiFlag(true)
                    } else {
                        setPiiFlag(false)
                    }
                }               
            }
        }
    })

    const toggleButton = async() => {
        const {type, domainId, dbName, tableName, columnName, resourceType} = props

        setSpinner(true)
        await DataDomain.togglePiiFlag(type, domainId, dbName, tableName, columnName, resourceType)
        setPiiFlag(!piiFlag)
        setSpinner(false)

        if (props.toggleCallback) {
            props.toggleCallback()
        }
    }

    const renderButton = () => {
        if (owner) {
            if (spinner) {
                return (
                    <Toggle disabled="true" checked={piiFlag}><Spinner /> Contains PII</Toggle>
                )
            } else {
                return (
                    <Toggle checked={piiFlag} onChange={({detail}) => toggleButton()}>Contains PII</Toggle>
                )
            }
        } else {
            return (
                <Badge color={(piiFlag ? "red" : "green")}>{piiFlag ? "Yes" : "No"}</Badge>
            )
        } 
    }

    return (
        <span>{renderButton()}</span>
    )
}

export default TogglePiiFlagComponent