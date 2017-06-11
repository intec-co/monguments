'use strict';

module.exports = function (permission, owner, request) {
    if (permission === 'w' || permission === 'r') {
        if (owner) {
            if (request.data[owner] === request.user) {
                return true;
            }
        }
    }
    else if (permission === 'W' || permission === 'R') {
        return true;
    }
    return false;
}
