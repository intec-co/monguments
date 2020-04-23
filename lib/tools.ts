export const getValue = (obj: any, attrStr: string): any => {
	const attrs = attrStr.split('.');
	let value = obj;
	try {
		attrs.forEach((attr) => {
			if (value[attr]) {
				value = value[attr];
			} else {
				throw undefined;
			}
		});

		return value;
	} catch (e) {

		return;
	}
};
