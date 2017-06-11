'use strict';

module.exports = function verifyProperties(data) {
    var properties = Object.getOwnPropertyNames(data);
    for (let property in properties) {
        if (property.indexOf("$") >= 0) {
            return false;
        }
    }
    return true;
}