import { magnitudeToMMI } from 'common/mathUtils';

describe('magnitudeToMMI', () => {
    it('should return "I" for magnitudes less than 3.5', () => {
        expect(magnitudeToMMI(3.4)).toBe("I");
    });
    it('should return "II-III" for magnitudes between 3.5 and 4.2', () => {
        expect(magnitudeToMMI(3.5)).toBe("II-III");
        expect(magnitudeToMMI(4.1)).toBe("II-III");
    });
    it('should return "IV" for magnitudes between 4.2 and 4.8', () => {
        expect(magnitudeToMMI(4.2)).toBe("IV");
        expect(magnitudeToMMI(4.7)).toBe("IV");
    });
    it('should return "V" for magnitudes between 4.8 and 5.4', () => {
        expect(magnitudeToMMI(4.8)).toBe("V");
        expect(magnitudeToMMI(5.3)).toBe("V");
    });
    it('should return "VI" for magnitudes between 5.4 and 6.1', () => {
        expect(magnitudeToMMI(5.4)).toBe("VI");
        expect(magnitudeToMMI(6.0)).toBe("VI");
    });
    it('should return "VII" for magnitudes between 6.1 and 6.5', () => {
        expect(magnitudeToMMI(6.1)).toBe("VII");
        expect(magnitudeToMMI(6.4)).toBe("VII");
    });
    it('should return "VIII" for magnitudes between 6.5 and 7.0', () => {
        expect(magnitudeToMMI(6.5)).toBe("VIII");
        expect(magnitudeToMMI(6.9)).toBe("VIII");
    });
    it('should return "IX" for magnitudes between 7.0 and 7.4', () => {
        expect(magnitudeToMMI(7.0)).toBe("IX");
        expect(magnitudeToMMI(7.3)).toBe("IX");
    });
    it('should return "X" for magnitudes between 7.4 and 8.1', () => {
        expect(magnitudeToMMI(7.4)).toBe("X");
        expect(magnitudeToMMI(8.0)).toBe("X");
    });
    it('should return "XI" for magnitudes between 8.1 and 8.9', () => {
        expect(magnitudeToMMI(8.1)).toBe("XI");
        expect(magnitudeToMMI(8.8)).toBe("XI");
    });
    it('should return "XII" for magnitudes 8.9 and greater', () => {
        expect(magnitudeToMMI(8.9)).toBe("XII");
        expect(magnitudeToMMI(10)).toBe("XII");
    });
});
