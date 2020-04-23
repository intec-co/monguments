export const checkData = (data: any): boolean => {
	const properties = Object.getOwnPropertyNames(data);
	properties.forEach(property => {
		if (property.indexOf('$') >= 0) {
			return false;
		}
	});

	return true;
};
