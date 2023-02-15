const tbacConfig = require(__dirname+"/../tbac-config.json")
const Tbac = {
    extractConfidentialityTag(lfTags) {
        return lfTags.find((tag) => tag.TagKey === tbacConfig.TagKeys.Confidentiality)
    }
}

export default Tbac