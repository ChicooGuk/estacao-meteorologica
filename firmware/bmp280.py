import time
from machine import I2C

class BMP280:
    def __init__(self, i2c: I2C, addr: int = 0x76):
        self.i2c = i2c
        self.addr = addr
        
        # Verifica se o sensor está presente no barramento
        devices = self.i2c.scan()
        if self.addr not in devices:
            # Tenta o endereço alternativo 0x77
            if 0x77 in devices:
                self.addr = 0x77
            else:
                raise RuntimeError(f"BMP280 não encontrado no endereço 0x76 ou 0x77. Dispositivos achados: {devices}")

        # Leitura dos registradores de calibração do BMP280
        self._read_calibration_data()

        # Configura o registrador de controle (ctrl_meas - 0xF4)
        # osrs_t x1 (001), osrs_p x1 (001), mode NORMAL (11) -> 0x27
        self.i2c.writeto_mem(self.addr, 0xF4, b'\x27')
        
        # Configura o registrador de configuração (config - 0xF5)
        # t_sb 0.5ms (000), filter off (000), spi3w_en off (0) -> 0x00
        self.i2c.writeto_mem(self.addr, 0xF5, b'\x00')
        time.sleep(0.1)

    def _read_calibration_data(self):
        # Lê 24 bytes de calibração a partir do registrador 0x88
        calib = self.i2c.readfrom_mem(self.addr, 0x88, 24)
        
        # Descompacta coeficientes de compensação de Temperatura
        self.dig_T1 = calib[1] << 8 | calib[0]
        self.dig_T2 = self._to_signed(calib[3] << 8 | calib[2])
        self.dig_T3 = self._to_signed(calib[5] << 8 | calib[4])

        # Descompacta coeficientes de compensação de Pressão
        self.dig_P1 = calib[7] << 8 | calib[6]
        self.dig_P2 = self._to_signed(calib[9] << 8 | calib[8])
        self.dig_P3 = self._to_signed(calib[11] << 8 | calib[10])
        self.dig_P4 = self._to_signed(calib[13] << 8 | calib[12])
        self.dig_P5 = self._to_signed(calib[15] << 8 | calib[14])
        self.dig_P6 = self._to_signed(calib[17] << 8 | calib[16])
        self.dig_P7 = self._to_signed(calib[19] << 8 | calib[18])
        self.dig_P8 = self._to_signed(calib[21] << 8 | calib[20])
        self.dig_P9 = self._to_signed(calib[23] << 8 | calib[22])

    @staticmethod
    def _to_signed(val):
        return val - 65536 if val > 32767 else val

    def ler_valores(self):
        # Lê 6 bytes a partir de 0xF7 (F7..FC: msb, lsb, xlsb da pressão e temperatura)
        data = self.i2c.readfrom_mem(self.addr, 0xF7, 6)
        
        adc_p = (data[0] << 12) | (data[1] << 4) | (data[2] >> 4)
        adc_t = (data[3] << 12) | (data[4] << 4) | (data[5] >> 4)

        # 1. Cálculo de compensação da Temperatura (necessário para calcular a pressão)
        var1 = (((adc_t >> 3) - (self.dig_T1 << 1)) * self.dig_T2) >> 11
        var2 = (((((adc_t >> 4) - self.dig_T1) * ((adc_t >> 4) - self.dig_T1)) >> 12) * self.dig_T3) >> 14
        t_fine = var1 + var2
        temperatura = ((t_fine * 5 + 128) >> 8) / 100.0

        # 2. Cálculo de compensação da Pressão Atmosférica
        var1 = t_fine - 128000
        var2 = var1 * var1 * self.dig_P6
        var2 = var2 + ((var1 * self.dig_P5) << 17)
        var2 = var2 + (self.dig_P4 << 35)
        var1 = ((var1 * var1 * self.dig_P3) >> 8) + ((var1 * self.dig_P2) << 12)
        var1 = (((1 << 47) + var1) * self.dig_P1) >> 33

        if var1 == 0:
            pressao_hpa = 0.0  # Evita divisão por zero
        else:
            p = 1048576 - adc_p
            p = int(((p << 31) - var2) * 3125 / var1)
            var1 = (self.dig_P9 * (p >> 13) * (p >> 13)) >> 25
            var2 = (self.dig_P8 * p) >> 19
            p = ((p + var1 + var2) >> 8) + (self.dig_P7 << 4)
            
            # Converte Pa para hPa (divisão por 100 e depois por 256 devido à escala de ponto fixo)
            pressao_hpa = (p / 256.0) / 100.0

        return round(temperatura, 1), round(pressao_hpa, 2)