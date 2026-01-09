const dateFromString = async (value: string) => {
        const date = new Date(value);

        if (isNaN(date?.getTime())) {
                throw new Error('Invalid date');
        }

        return date;
};

const sanitizeRequestBody = (data: Record<string, unknown>) => {
        const sanitize: Record<string, unknown> = {};

        for (const [key, value] of Object.entries(data)) {
                if (value === null || value === undefined) {
                        sanitize[key] = value;
                        continue;
                }

                if (typeof value === 'string') {
                        sanitize[key] = value.trim() === '' ? null : value.trim();
                } else if (typeof value === 'object' && !Array.isArray(value)) {
                        sanitize[key] = sanitizeRequestBody(value as Record<string, unknown>);
                } else if (Array.isArray(value)) {
                        sanitize[key] = value.map(item =>
                                typeof item === 'object' && item !== null
                                        ? sanitizeRequestBody(item as Record<string, unknown>)
                                        : item
                        );
                } else {
                        sanitize[key] = value;
                }
        }

        return sanitize;
};

const oneHour = 60 * 60 * 1000;
const fiveMinutes = 5 * 60 * 1000;
const fifteenMinutes = 15 * 60 * 1000;
const twentyFourHours = 24 * 60 * 60 * 1000;

export { oneHour, fiveMinutes, fifteenMinutes, twentyFourHours, dateFromString, sanitizeRequestBody };
