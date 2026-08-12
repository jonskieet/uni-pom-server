// src/components/FormRenderer.tsx — 12-column grid, FieldWidth, styled sections
import { useState, useRef } from 'react'
import type { FormTemplate, FormField, FormData, GroupTableGroup } from '../types/form'
import { WIDTH_SPAN, BASE_FIELDS, newGroup } from '../types/form'
import { colors } from '../styles/theme'
import { RichTextEditor } from './RichTextEditor'
import { uploadFileToSupabase } from '../utils/uploadFile'

const inp: React.CSSProperties = {
  width:'100%', padding:'7px 10px', fontSize:13,
  borderRadius:8, border:`0.5px solid ${colors.border}`,
  background:colors.bgPrimary, color:colors.textPrimary,
  boxSizing:'border-box', outline:'none', fontFamily:'inherit',
}
const inpSm: React.CSSProperties = { ...inp, padding:'5px 8px', fontSize:12 }

// ── Bảng theo nhóm (field type='group_table') ────────────────
// Mỗi nhóm = 1 tên dùng chung (vd. "Switch/Hub") + N hàng con.
// STT hiển thị LIÊN TỤC xuyên suốt mọi nhóm (khớp cách đánh số ở
// file mẫu) — không reset về 1 khi sang nhóm mới.
function GroupTableField({ field, value, onChange, readOnly }: {
  field: FormField; value: any; onChange: (v: GroupTableGroup[]) => void; readOnly?: boolean
}) {
  const initGroups = (): GroupTableGroup[] =>
    Array.isArray(value) && value.length > 0 ? value : [newGroup()]
  const [groups, setGroups] = useState<GroupTableGroup[]>(initGroups)
  const cols = field.columns ?? []

  const commit = (next: GroupTableGroup[]) => { setGroups(next); onChange(next) }

  const updateGroupName = (gi: number, name: string) => {
    const next = [...groups]; next[gi] = { ...next[gi], name }; commit(next)
  }
  const addGroup = () => commit([...groups, newGroup()])
  const removeGroup = (gi: number) => {
    if (groups.length <= 1) return
    commit(groups.filter((_, i) => i !== gi))
  }
  const addRow = (gi: number) => {
    const next = [...groups]
    next[gi] = { ...next[gi], rows: [...next[gi].rows, {}] }
    commit(next)
  }
  const removeRow = (gi: number, ri: number) => {
    const next = [...groups]
    if (next[gi].rows.length <= 1) return
    next[gi] = { ...next[gi], rows: next[gi].rows.filter((_, i) => i !== ri) }
    commit(next)
  }
  const updateCell = (gi: number, ri: number, key: string, v: any) => {
    const next = [...groups]
    const rows = [...next[gi].rows]
    rows[ri] = { ...rows[ri], [key]: v }
    next[gi] = { ...next[gi], rows }
    commit(next)
  }

  let stt = 0

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12, marginTop:4 }}>
      {groups.map((g, gi) => (
        <div key={g.id} style={{
          border:`0.5px solid ${colors.border}`, borderRadius:10, overflow:'hidden',
        }}>
          <div style={{
            display:'flex', alignItems:'center', gap:8, padding:'8px 10px',
            background:colors.bgSecondary, borderBottom:`0.5px solid ${colors.border}`,
          }}>
            <i className="ti ti-folder" style={{fontSize:13,color:colors.textTertiary}}/>
            <input
              style={{...inpSm,flex:1,fontWeight:600,background:colors.bgPrimary}}
              placeholder={`Tên nhóm ${gi+1} (vd. Switch/Hub)`}
              value={g.name} readOnly={readOnly}
              onChange={e=>updateGroupName(gi, e.target.value)}
            />
            {!readOnly && (
              <button onClick={()=>removeGroup(gi)} disabled={groups.length<=1}
                title="Xoá nhóm"
                style={{background:'none',border:'none',cursor:groups.length<=1?'not-allowed':'pointer',
                  color:groups.length<=1?colors.textTertiary:colors.danger,fontSize:15,opacity:groups.length<=1?0.4:1}}>
                <i className="ti ti-trash"/>
              </button>
            )}
          </div>

          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
              <thead>
                <tr>
                  <th style={{padding:'6px 8px',textAlign:'center',width:36,fontSize:11,
                    fontWeight:600,color:colors.textTertiary,background:'#fff',
                    borderBottom:`0.5px solid ${colors.borderLight}`}}>STT</th>
                  {cols.map(c=>(
                    <th key={c.key} style={{padding:'6px 8px',textAlign:'left',fontSize:11,
                      fontWeight:600,color:colors.textTertiary,background:'#fff',
                      borderBottom:`0.5px solid ${colors.borderLight}`}}>{c.label}</th>
                  ))}
                  {!readOnly && <th style={{width:32,background:'#fff',borderBottom:`0.5px solid ${colors.borderLight}`}}/>}
                </tr>
              </thead>
              <tbody>
                {g.rows.map((row, ri) => {
                  stt += 1
                  const curStt = stt
                  return (
                    <tr key={ri} style={{borderBottom:`0.5px solid ${colors.borderLight}`}}>
                      <td style={{padding:'4px 8px',textAlign:'center',fontSize:12,
                        fontWeight:600,color:colors.textTertiary}}>{curStt}</td>
                      {cols.map(c=>(
                        <td key={c.key} style={{padding:'3px 6px'}}>
                          {c.type==='select' ? (
                            <select style={inpSm} value={row[c.key]??''} disabled={readOnly}
                              onChange={e=>updateCell(gi,ri,c.key,e.target.value)}>
                              <option value="">—</option>
                              {(c.options??[]).map(o=><option key={o} value={o}>{o}</option>)}
                            </select>
                          ) : (
                            <input style={inpSm} type={c.type==='number'?'number':'text'}
                              value={row[c.key]??''} readOnly={readOnly}
                              placeholder={readOnly?'':c.label}
                              onChange={e=>updateCell(gi,ri,c.key,e.target.value)} />
                          )}
                        </td>
                      ))}
                      {!readOnly && (
                        <td style={{padding:'3px 6px',textAlign:'center'}}>
                          <button onClick={()=>removeRow(gi,ri)} disabled={g.rows.length<=1}
                            style={{background:'none',border:'none',
                              cursor:g.rows.length<=1?'not-allowed':'pointer',
                              color:colors.danger,fontSize:15,opacity:g.rows.length<=1?0.4:1}}>×</button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {!readOnly && (
            <button onClick={()=>addRow(gi)} style={{
              width:'100%',fontSize:11,color:colors.primary,background:colors.bgPrimary,
              border:'none',borderTop:`0.5px dashed ${colors.border}`,padding:'6px',cursor:'pointer',
              display:'flex',alignItems:'center',justifyContent:'center',gap:4,
            }}>
              <i className="ti ti-plus" style={{fontSize:12}}/>Thêm dòng vào "{g.name || `Nhóm ${gi+1}`}"
            </button>
          )}
        </div>
      ))}

      {!readOnly && (
        <button onClick={addGroup} style={{
          fontSize:12,color:colors.primary,background:colors.primaryLight,
          border:`0.5px dashed ${colors.primary}`,borderRadius:8,padding:'8px 16px',
          cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:6,
        }}>
          <i className="ti ti-folder-plus" style={{fontSize:13}}/>Thêm nhóm
        </button>
      )}
    </div>
  )
}

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
  const [uploadingImg, setUploadingImg] = useState(false)
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

      // ── Image field ─────────────────────────────────────────
      // FIX: upload thật lên Supabase qua IPC thay vì dùng blob URL tạm thời.
      // Blob URL (URL.createObjectURL) chỉ sống trong session hiện tại —
      // khi lưu vào DB rồi mở lại thì ảnh sẽ bị mất.
      // Giờ mỗi ảnh được upload → nhận public URL từ Supabase → lưu vào form_data.
      case 'image': {
        const files: string[] = Array.isArray(value) ? value : []

        const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
          const selected = Array.from(e.target.files ?? [])
          if (!selected.length) return

          // Reset input để có thể chọn lại cùng file nếu cần
          if (fileRef.current) fileRef.current.value = ''

          setUploadingImg(true)
          try {
            const uploadedUrls = await Promise.all(
              selected.map(file => uploadFileToSupabase(file))
            )
            onChange(field.multiple ? [...files, ...uploadedUrls] : [uploadedUrls[0]])
          } catch (err: any) {
            alert('Upload ảnh thất bại: ' + (err.message ?? 'Lỗi không xác định'))
          } finally {
            setUploadingImg(false)
          }
        }

        return (
          <div>
            <input
              ref={fileRef}
              type="file"
              accept={field.accept ?? 'image/*'}
              multiple={field.multiple}
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
            <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
              {/* Ảnh đã upload — src là Supabase public URL, luôn hiển thị được */}
              {files.map((src, i) => (
                <div key={i} style={{ position:'relative' }}>
                  <img
                    src={src}
                    alt=""
                    style={{
                      width:80, height:80, objectFit:'cover',
                      borderRadius:8, border:`0.5px solid ${colors.border}`,
                    }}
                  />
                  {!readOnly && (
                    <button
                      onClick={() => onChange(files.filter((_, j) => j !== i))}
                      style={{
                        position:'absolute', top:-6, right:-6,
                        background:colors.danger, color:'#fff',
                        border:'none', borderRadius:'50%',
                        width:18, height:18, cursor:'pointer', fontSize:11,
                        display:'flex', alignItems:'center', justifyContent:'center',
                      }}
                    >×</button>
                  )}
                </div>
              ))}

              {/* Nút thêm ảnh / spinner khi đang upload */}
              {!readOnly && (
                <button
                  onClick={() => !uploadingImg && fileRef.current?.click()}
                  disabled={uploadingImg}
                  title={uploadingImg ? 'Đang tải ảnh lên...' : 'Thêm ảnh'}
                  style={{
                    width:80, height:80, borderRadius:8,
                    cursor: uploadingImg ? 'not-allowed' : 'pointer',
                    border:`1.5px dashed ${uploadingImg ? colors.primary : colors.border}`,
                    background:colors.bgSecondary,
                    color: uploadingImg ? colors.primary : colors.textTertiary,
                    fontSize:22,
                    display:'flex', flexDirection:'column',
                    alignItems:'center', justifyContent:'center', gap:4,
                  }}
                >
                  {uploadingImg
                    ? <i className="ti ti-loader-2" style={{
                        fontSize:22,
                        animation:'spin 1s linear infinite',
                      }}/>
                    : <i className="ti ti-plus"/>
                  }
                  {uploadingImg && (
                    <span style={{fontSize:9, color:colors.primary}}>Đang tải...</span>
                  )}
                </button>
              )}
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )
      }

      case 'richtext':
        return (
          <RichTextEditor
            content={value}
            onChange={readOnly ? undefined : (doc) => onChange(doc)}
            readOnly={readOnly}
            placeholder={field.placeholder}
          />
        )

      case 'group_table':
        return <GroupTableField field={field} value={value} onChange={onChange} readOnly={readOnly} />

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
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>

      {/* ── THÔNG TIN CƠ BẢN — luôn hiển thị, không thể xóa ── */}
      <div>
        <div style={{
          display:'flex', alignItems:'center', gap:8, padding:'8px 14px',
          background:'linear-gradient(90deg,#3b3290 0%,#5b52c8 100%)',
          borderRadius:'8px 8px 0 0',
        }}>
          <i className="ti ti-lock" style={{color:'#fff',fontSize:13}}/>
          <span style={{fontSize:11,fontWeight:700,textTransform:'uppercase',
            letterSpacing:'0.07em',color:'#fff'}}>
            THÔNG TIN CƠ BẢN
          </span>
          <span style={{marginLeft:'auto',fontSize:10,
            color:'rgba(255,255,255,0.65)',fontStyle:'italic'}}>
            Bắt buộc · Có trong mọi phiếu khảo sát
          </span>
        </div>
        <div style={{
          display:'grid', gridTemplateColumns:'repeat(12,1fr)', gap:14,
          padding:'16px', background:'#f8f7ff',
          border:'1px solid #c7d2fe', borderRadius:'0 0 8px 8px',
        }}>
          {BASE_FIELDS.map(field=>(
            <FieldRenderer key={field.id} field={field}
              value={data[field.key]}
              onChange={val=>handleChange(field.key,val)}
              readOnly={readOnly}/>
          ))}
        </div>
      </div>

      {/* ── THÔNG TIN CHUYÊN BIỆT — do trưởng phòng KT thiết kế ── */}
      {template.fields.length > 0 && (
        <div>
          <div style={{
            display:'flex', alignItems:'center', gap:8, padding:'8px 14px',
            background:'linear-gradient(90deg,#0f766e 0%,#14b8a6 100%)',
            borderRadius:'8px 8px 0 0',
          }}>
            <i className="ti ti-layout-grid" style={{color:'#fff',fontSize:13}}/>
            <span style={{fontSize:11,fontWeight:700,textTransform:'uppercase',
              letterSpacing:'0.07em',color:'#fff'}}>
              THÔNG TIN CHUYÊN BIỆT
            </span>
          </div>
          <div style={{
            display:'grid', gridTemplateColumns:'repeat(12,1fr)', gap:16,
            padding:'16px', border:'1px solid #99f6e4',
            borderRadius:'0 0 8px 8px', background:'#f0fdfa',
          }}>
            {template.fields.map(field=>(
              <FieldRenderer key={field.id} field={field}
                value={data[field.key]}
                onChange={val=>handleChange(field.key,val)}
                readOnly={readOnly}/>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
