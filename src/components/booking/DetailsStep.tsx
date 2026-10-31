import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { customerSchema, NOTE_MAX, type CustomerFormValues } from '../../lib/validation'
import { Field, inputClass } from '../ui/Field'
import { DETAILS_FORM_ID } from './constants'

interface Props {
  values: CustomerFormValues
  onSubmit: (v: CustomerFormValues) => void
}

export function DetailsStep({ values, onSubmit }: Props) {
  const { register, handleSubmit, watch, formState: { errors } } = useForm<CustomerFormValues>({
    defaultValues: values,
    resolver: zodResolver(customerSchema),
    mode: 'onTouched',
  })
  const noteLen = watch('note')?.length ?? 0

  return (
    <form id={DETAILS_FORM_ID} onSubmit={handleSubmit(onSubmit)} noValidate className="grid max-w-xl gap-5 sm:grid-cols-2">
      <Field id="ad" label="Ad" required error={errors.firstName?.message}>
        {(p) => <input {...p} {...register('firstName')} autoComplete="given-name" className={inputClass} />}
      </Field>
      <Field id="soyad" label="Soyad" required error={errors.lastName?.message}>
        {(p) => <input {...p} {...register('lastName')} autoComplete="family-name" className={inputClass} />}
      </Field>
      <div className="sm:col-span-2">
        <Field id="telefon" label="Cep telefonu" required hint="Örn. 0532 123 45 67" error={errors.phone?.message}>
          {(p) => <input {...p} {...register('phone')} type="tel" inputMode="tel" autoComplete="tel" className={inputClass} />}
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field id="eposta" label="E-posta" optionalLabel error={errors.email?.message}>
          {(p) => <input {...p} {...register('email')} type="email" autoComplete="email" className={inputClass} />}
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field id="not" label="Not" optionalLabel hint={`${noteLen}/${NOTE_MAX}`} error={errors.note?.message}>
          {(p) => <textarea {...p} {...register('note')} rows={3} maxLength={NOTE_MAX + 50} className={inputClass} />}
        </Field>
      </div>
    </form>
  )
}
