// src/components/FormRenderer.tsx — 12-column grid, FieldWidth, styled sections
import { useState, useRef } from 'react'
import type { FormTemplate, FormField, FormData } from '../types/form'
import { WIDTH_SPAN } from '../types/form'
import { colors } from '../styles/theme'

const inp: React.CSSProperties = {
  width:'100%', padding:'7px 10px', fontSize:13,
  borderRadius:8, border:`0.5px solid ${colors.border}`,
  background:colors.bgPrimary, color:colors.textPrimary,
  boxSizing:'border-box', outline:'none', fontFamily:'inherit',
}
const inpSm: React.CSSProperties = { ...inp, padding:'5px 8px', fontSize:12 }

function FieldRenderer({ field, value, onChange, readOnly }: {
  field:FormField; value:any; onChange:(v:any)=>void; readOnly?:boolean
}) {
  const initRows = () => {
    if (Array.isArray(value) && value.length > 0) return value
    if (Array.isArray(field.defaultRows) && field.defaultRows.length > 0)
      return field.defaultRows.map(r => ({ ...r }))
    return [{}]
  }
  const [tableRows, setTableRows] = useState<Record<string,any>[]>(initRows)
  const fileRef = useRef<HTMLInputElement>(null)
  const updateTable = (rows: Record<string,any>[]) => { setTableRows(rows); onChange(rows) }

  const span = WIDTH_SPAN[field.width] ?? 12

  // Section header
  if (field.type === 'section') return (
    <div style={{ gridColumn: '1 / -1', marginTop: 8, marginBottom: 2 }}>
      <div style={{
        display:'flex', alignItems:'center', gap:8,
        padding:'8px 16px', background:colors.primary,
        borderRadius:'8px 8px 0 0', color:'#fff',
      }}>
        <i className="ti ti-layout-rows" style={{fontSize:14}}/>
        <span style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.07em'}}>
          {field.label}
        </span>
      </div>
      {field.helpText && (
        <div style={{fontSize:12,color:colors.textTertiary,padding:'4px 16px',
          background:colors.bgSecondary,borderBottom:`1px solid ${colors.border}`}}>
          {field.helpText}
        </div>
      )}
    </div>
  )

  const label = (
    <div style={{fontSize:12,fontWeight:500,color:colors.textSecondary,marginBottom:4}}>
      {field.label}
      {field.required && <span style={{color:colors.danger,marginLeft:3}}>*</span>}
    </div>
  )
  const help = field.helpText && (
    <div style={{fontSize:11,color:colors.textTertiary,marginTop:3}}>{field.helpText}</div>
  )

  const content = (() => {
    switch (field.type) {
      case 'text':
        return <input style={inp} type="text" placeholder={field.placeholder}
          value={value??''} readOnly={readOnly} onChange={e=>onChange(e.target.value)}/>
      case 'textarea':
        return <textarea style={{...inp,minHeight:80,resize:'vertical'}}
          placeholder={field.placeholder} value={value??''} readOnly={readOnly}
          onChange={e=>onChange(e.target.value)}/>
      case 'number':
        return <input style={inp} type="number" placeholder={field.placeholder}
          value={value??''} readOnly={readOnly}
          onChange={e=>onChange(e.target.value===''?'':+e.target.value)}/>
      case 'date':
        return <input style={inp} type="date" value={value??''} readOnly={readOnly}
          onChange={e=>onChange(e.target.value)}/>
      case 'select':
        return (
          <select style={{...inp,cursor:'pointer'}} value={value??''} disabled={readOnly}
            onChange={e=>onChange(e.target.value)}>
            <option value="">{field.placeholder??'-- Chọn --'}</option>
            {(field.options??[]).map(opt=><option key={opt} value={opt}>{opt}</option>)}
          </select>
        )
      case 'radio':
        return (
          <div style={{display:'flex',flexWrap:'wrap',gap:12,marginTop:4}}>
            {(field.options??[]).map(opt=>(
              <label key={opt} style={{display:'flex',alignItems:'center',gap:6,
                fontSize:13,cursor:readOnly?'default':'pointer'}}>
                <input type="radio" name={field.key} value={opt}
                  checked={value===opt} readOnly={readOnly}
                  onChange={()=>!readOnly&&onChange(opt)}/>
                {opt}
              </label>
            ))}
          </div>
        )
      case 'checkbox': {
        const checked:string[] = Array.isArray(value)?value:[]
        return (
          <div style={{display:'flex',flexWrap:'wrap',gap:12,marginTop:4}}>
            {(field.options??[]).map(opt=>(
              <label key={opt} style={{display:'flex',alignItems:'center',gap:6,
                fontSize:13,cursor:readOnly?'default':'pointer'}}>
                <input type="checkbox" checked={checked.includes(opt)} disabled={readOnly}
                  onChange={e=>{
                    if(readOnly)return
                    onChange(e.target.checked?[...checked,opt]:checked.filter(v=>v!==opt))
                  }}/>
                {opt}
              </label>
            ))}
          </div>
        )
      }
      case 'table': {
        const cols = field.columns??[]
        return (
          <div style={{overflowX:'auto',marginTop:4}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
              <thead>
                <tr>
                  <th style={{
                    padding:'7px 10px',textAlign:'center',whiteSpace:'nowrap',width:44,
                    background:colors.primary,color:'#fff',fontSize:12,fontWeight:600,
                    borderRadius:'6px 0 0 0',
                  }}>STT</th>
                  {cols.map((c,ci)=>(
                    <th key={c.key} style={{
                      padding:'7px 10px',textAlign:'left',whiteSpace:'nowrap',
                      background:colors.primary,color:'#fff',fontSize:12,fontWeight:600,
                      borderRadius:ci===cols.length-1&&readOnly?'0 6px 0 0':'0',
                    }}>{c.label}</th>
                  ))}
                  {!readOnly&&<th style={{background:colors.primary,width:36,borderRadius:'0 6px 0 0'}}/>}
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row,ri)=>(
                  <tr key={ri} style={{
                    background:ri%2===0?'#fff':colors.bgSecondary,
                    borderBottom:`0.5px solid ${colors.borderLight}`,
                  }}>
                    <td style={{padding:'5px 8px',textAlign:'center',
                      fontSize:12,fontWeight:600,color:colors.textTertiary}}>{ri+1}</td>
                    {cols.map(c=>(
                      <td key={c.key} style={{padding:'4px 6px'}}>
                        {c.type==='select'?(
                          <select style={inpSm} value={row[c.key]??''} disabled={readOnly}
                            onChange={e=>{const r=[...tableRows];r[ri]={...r[ri],[c.key]:e.target.value};updateTable(r)}}>
                            <option value="">—</option>
                            {(c.options??[]).map(o=><option key={o} value={o}>{o}</option>)}
                          </select>
                        ):(
                          <input style={inpSm} type={c.type==='number'?'number':'text'}
                            value={row[c.key]??''} readOnly={readOnly}
                            placeholder={readOnly?'':c.label}
                            onChange={e=>{const r=[...tableRows];r[ri]={...r[ri],[c.key]:e.target.value};updateTable(r)}}/>
                        )}
                      </td>
                    ))}
                    {!readOnly&&(
                      <td style={{padding:'4px 6px',textAlign:'center'}}>
                        <button onClick={()=>updateTable(tableRows.filter((_,i)=>i!==ri))}
                          style={{background:'none',border:'none',cursor:'pointer',
                            color:colors.danger,fontSize:16,lineHeight:1,padding:'2px 4px'}}>×</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {!readOnly&&(
              <button onClick={()=>{
                const tmpl=field.defaultRows?.[0]
                const newRow=tmpl?Object.fromEntries(Object.keys(tmpl).map(k=>[k,''])):{}
                updateTable([...tableRows,newRow])
              }} style={{marginTop:8,fontSize:12,color:colors.primary,
                background:colors.primaryLight,border:`0.5px dashed ${colors.primary}`,
                borderRadius:6,padding:'6px 16px',cursor:'pointer',width:'100%',
                display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
                <i className="ti ti-plus" style={{fontSize:13}}/>Thêm hàng
              </button>
            )}
          </div>
        )
      }
      case 'image': {
        const files: string[] = Array.isArray(value) ? value : []
        const [uploading, setUploading] = useState(false)

        // Đọc file → base64 → upload Supabase → lưu URL thật (không dùng blob URL)
        const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
          const selected = Array.from(e.target.files ?? [])
          if (!selected.length) return
          setUploading(true)
          try {
            const uploaded: string[] = []
            for (const file of selected) {
              const base64 = await new Promise<string>((res, rej) => {
                const reader = new FileReader()
                reader.onload  = () => res((reader.result as string).split(',')[1])
                reader.onerror = () => rej(new Error('Đọc file thất bại'))
                reader.readAsDataURL(file)
              })
              const result = await (window as any).api.upload.imageBase64(
                'surveys', base64, file.type
              )
              if (result?.error) throw new Error(result.error)
              uploaded.push(result.url)
            }
            onChange(field.multiple ? [...files, ...uploaded] : uploaded.slice(0, 1))
          } catch (err: any) {
            alert('Upload ảnh thất bại: ' + err.message)
          } finally {
            setUploading(false)
            // Reset input để có thể chọn cùng file lần sau
            if (fileRef.current) fileRef.current.value = ''
          }
        }

        return (
          <div>
            <input ref={fileRef} type="file" accept={field.accept ?? 'image/*'}
              multiple={field.multiple} style={{ display: 'none' }}
              onChange={handleFileChange} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              {files.map((src, i) => (
                <div key={i} style={{ position: 'relative' }}>
                  <img src={src} alt="" style={{
                    width: 80, height: 80, objectFit: 'cover',
                    borderRadius: 8, border: `0.5px solid ${colors.border}`,
                    display: 'block',
                  }} />
                  {!readOnly && (
                    <button onClick={() => onChange(files.filter((_, j) => j !== i))}
                      style={{
                        position: 'absolute', top: -6, right: -6,
                        background: colors.danger, color: '#fff',
                        border: 'none', borderRadius: '50%', width: 18, height: 18,
                        cursor: 'pointer', fontSize: 11,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>×</button>
                  )}
                </div>
              ))}
              {!readOnly && (
                <button
                  onClick={() => !uploading && fileRef.current?.click()}
                  disabled={uploading}
                  style={{
                    width: 80, height: 80, borderRadius: 8,
                    cursor: uploading ? 'wait' : 'pointer',
                    border: `1.5px dashed ${uploading ? colors.primary : colors.border}`,
                    background: colors.bgSecondary,
                    color: uploading ? colors.primary : colors.textTertiary,
                    fontSize: uploading ? 12 : 22,
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', gap: 4,
                  }}>
                  {uploading
                    ? <><i className="ti ti-loader-2" style={{ fontSize: 22, animation: 'spin 1s linear infinite' }} />
                        <span style={{ fontSize: 10 }}>Đang tải...</span></>
                    : <i className="ti ti-plus" />
                  }
                </button>
              )}
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )
      }
      default: return null
    }
  })()

  return (
    <div style={{ gridColumn: `span ${span}` }}>
      {label}{content}{help}
    </div>
  )
}

export function FormRenderer({ template, data={}, onChange, readOnly }: {
  template:FormTemplate; data?:FormData; onChange?:(d:FormData)=>void; readOnly?:boolean
}) {
  const handleChange = (key:string, val:any) => onChange?.({...data,[key]:val})
  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(12,1fr)', gap:16 }}>
      {template.fields.map(field=>(
        <FieldRenderer key={field.id} field={field}
          value={data[field.key]}
          onChange={val=>handleChange(field.key,val)}
          readOnly={readOnly}/>
      ))}
    </div>
  )
}
