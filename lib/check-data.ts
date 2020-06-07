export const checkData = (data: any): boolean => {
	for (const property in data) {
		if (property.indexOf('$') >= 0) {
			return false;
		}
	}

	return true;
};
