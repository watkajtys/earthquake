
export const getFaultColor = (type) => {
    switch (type) {
        case 'Convergent':
            return 'rgba(220, 20, 60, 0.8)';
        case 'Divergent':
            return 'rgba(60, 179, 113, 0.8)';
        case 'Transform':
            return 'rgba(70, 130, 180, 0.8)';
        default:
            return 'rgba(255, 165, 0, 0.8)';
    }
};
