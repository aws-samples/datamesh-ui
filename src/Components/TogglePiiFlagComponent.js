import { Badge, Spinner, Toggle } from "@cloudscape-design/components"
import { useEffect, useState } from "react"
import DataDomain from "../Backend/DataDomain"

function TogglePiiFlagComponent(props) {
    const [spinner, setSpinner] = useState(false)
    const [owner, setOwner] = useState(false)
    const [piiFlag, setPiiFlag] = useState(false)

    useEffect(() => {
        const parameters = props.objectParameters
        setOwner(props.owner)

        if (parameters && "pii_flag" in parameters && parameters.pii_flag === "true") {
            setPiiFlag(true)
        }
    }, [props.owner])

    const toggleButton = async() => {
        const {type, domainId, dbName, tableName, columnName} = props

        setSpinner(true)
        await DataDomain.togglePiiFlag(type, domainId, dbName, tableName, columnName)
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

        return null
    }

    return (
        <span>{renderButton()}</span>
    )
}

export default TogglePiiFlagComponent