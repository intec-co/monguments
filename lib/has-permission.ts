import { MgRequest } from './interfaces';

export const hasPermission = (permission: string, owner: string, request: MgRequest) => {
	if (permission === 'w' || permission === 'r') {
		if (owner) {
			if (request.data[owner] === request.user) {
				return true;
			}
		}
	} else if (permission === 'W' || permission === 'R') {
		return true;
	}

	return false;
};
