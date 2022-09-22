import { ButtonDropdown } from "@cloudscape-design/components"
import { useEffect, useState } from "react"
import DataDomain from "../Backend/DataDomain"

function DataDomainActionComponent(props) {
    const [owner, setOwner] = useState(false)

    useEffect(() => {
        async function run() {
            setOwner(await DataDomain.isOwner(props.item.Parameters.data_owner))
        }

        run()
    }, [])

    return (
        <ButtonDropdown expandToViewport="true" items={[
            {text: "Register Data Product", disabled: !owner, disabledReason: "Not Data Owner", href: `/product-registration/${props.item.Name}/new`},
            {text: "View Tables", href: `/tables/${props.item.Name}`}
        ]}>Actions</ButtonDropdown>
    )
}

export default DataDomainActionComponent