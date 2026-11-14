import { MgRequest } from './types';

export const hasPermission = (permission: string, owner: string, request: MgRequest) => {
	if (permission === 'w' || permission === 'r' || permission === 'o') {
		if (owner) {
			if (request.data[owner] === request.user) {
				return true;
			}
		}
	} else if (permission === 'W' || permission === 'R' || permission === 'O') {
		return true;
	}

	return false;
};
