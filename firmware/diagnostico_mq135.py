"""Diagnóstico manual; executar com main.py pausado.

Divisor 10k entre AO e D35, 20k entre D35 e GND: fator 1,5. Antes de conectar AO, confirmar com multímetro que
a tensão permanece na faixa admissível do ESP32; não aplicar AO de 5 V.
read_uv() não é confiável no limite inferior e não calibra ppm.
"""
from machine import Pin, ADC
import time

FATOR_DIVISOR = 1.5
adc = ADC(Pin(35))
adc.atten(ADC.ATTN_0DB)
adc.width(ADC.WIDTH_12BIT)


def ler_sensor(amostras=32):
    soma_adc = 0
    soma_uv = 0
    for _ in range(amostras):
        soma_adc += adc.read()
        soma_uv += adc.read_uv()
        time.sleep_ms(2)
    bruto = soma_adc / amostras
    volts = soma_uv / amostras / 1_000_000
    return bruto, volts, volts * FATOR_DIVISOR


while True:
    bruto, volts, ao = ler_sensor()
    print("ADC: {:.3f} | D35 estimado: {:.3f} V | AO estimado: {:.3f} V".format(
        bruto, volts, ao))
    time.sleep(1)
