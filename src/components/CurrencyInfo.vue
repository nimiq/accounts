<template>
    <div class="currency-info">
        <h1 class="nq-h1">
            <span v-if="currency === constructor.Currency.NIM" class="nq-icon nimiq-logo"></span>
            <img v-else-if="currencyIcon" :src="currencyIcon"/>
            {{currency}}
        </h1>
        <p class="nq-text">
            <span v-if="fiatFeeAmount === 0">{{ $t('No') }}</span>
            <span v-else-if="isAlmostFree">~ 0</span>
            <span v-else>
                ~
                <FiatAmount :amount="fiatFeeAmount" :currency="fiatCurrency" />
            </span>
            {{ $t('Fee') }}
        </p>
    </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { FiatAmount } from '@nimiq/vue-components';
import { Currency as PublicCurrency } from '../../client/PublicRequestTypes';

@Component({components: {FiatAmount}})
class CurrencyInfo extends Vue {
    @Prop({ type: String, required: true }) private currency!: PublicCurrency;
    @Prop({ type: String, required: true }) private fiatCurrency!: string;
    @Prop({ type: Number, required: true }) private fiatFeeAmount!: number;
    @Prop(String) private currencyIcon?: string;

    private get isAlmostFree() {
        // Check whether the amount is less than 1 of the smallest unit by checking whether all digits of the rendered
        // number are 0.
        return this.fiatFeeAmount !== 0
            && !!this.fiatFeeAmount.toLocaleString('en-US', { style: 'currency', currency: this.fiatCurrency })
                .replace(/\D+/g, '') // remove all non-digits
                .match(/^0+$/);
    }
}

namespace CurrencyInfo {
    export const Currency = PublicCurrency;
}

export default CurrencyInfo;
</script>

<style scoped>
    .currency-info h1 {
        display: flex;
        align-items: center;
        margin-bottom: 0 !important;
        padding-bottom: 1.5rem; /* use padding instead of rem to make gap clickable */
        text-transform: uppercase;
        font-size: 3.375rem;
    }

    .currency-info img,
    .currency-info .nq-icon {
        height: 4.5rem;
        margin-right: 2rem;
    }

    .currency-info .nq-icon {
        width: 4.5rem;
    }

    .currency-info p {
        margin-top: 0;
        margin-bottom: 3.25rem;
        font-size: 2.5rem;
    }
</style>
